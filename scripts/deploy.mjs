#!/usr/bin/env node

/**
 * 一键部署脚本：构建前端 → 打包 → 上传 → 重启后端
 *
 * 首次使用：
 *   1. 复制 .env.example 为 .env
 *   2. npm run deploy:setup-ssh   （生成密钥 + 上传公钥，setup 阶段输入一次密码）
 *   3. npm run deploy
 *
 * 依赖：OpenSSH 客户端 (ssh/scp)，服务器需有 Node.js + nginx
 */

import { unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './deploy-env.mjs'
import { createRemoteClient } from './remote.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEPLOY_TAR = join(ROOT, '.deploy-tmp.tar.gz')

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', bold: '\x1b[1m' }
function log(tag, msg) { console.log(`${C.cyan}[${tag}]${C.reset} ${msg}`) }
function ok(msg) { console.log(`${C.green}  ✓${C.reset} ${msg}`) }
function warn(msg) { console.log(`${C.yellow}  ⚠${C.reset} ${msg}`) }
function fail(msg) { console.error(`${C.red}  ✗${C.reset} ${msg}`) }

async function main() {
  const config = loadDeployEnv()
  const { run, ssh, scp } = createRemoteClient(config, ROOT)

  const {
    DEPLOY_HOST, DEPLOY_PORT, DEPLOY_API_PORT,
    DEPLOY_PROJECT_DIR, DEPLOY_DB_PATH, DEPLOY_PGLITE_DIR, DEPLOY_DEFAULT_USER_ID,
  } = config

  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.cyan}║   Chattodo 一键部署                  ║${C.reset}`)
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════╝${C.reset}\n`)
  log('TARGET', `${config.DEPLOY_USER}@${DEPLOY_HOST}`)
  log('PORTS', `前端 :${DEPLOY_PORT}  ← 后端 :${DEPLOY_API_PORT}`)
  console.log()

  log('BUILD', '构建前端…')
  try { await run('npm', ['run', 'build']) }
  catch { fail('前端构建失败'); process.exit(1) }
  ok('前端构建完成')

  log('PACK', '打包项目文件…')
  const tarFilters = [
    '--exclude=node_modules', '--exclude=server/node_modules',
    '--exclude=.git', '--exclude=.idea', '--exclude=.env',
    '--exclude=*.log', '--exclude=*.stackdump',
  ]
  try {
    await run('tar', ['-czf', DEPLOY_TAR, ...tarFilters, '-C', ROOT, 'dist', 'server'])
  } catch {
    fail('打包失败'); process.exit(1)
  }
  ok('打包完成')

  log('UPLOAD', '上传到服务器…')
  try { await scp(DEPLOY_TAR, '/tmp/chattodo-deploy.tar.gz') }
  catch { fail('上传失败，若未初始化密钥请运行 npm run deploy:setup-ssh'); process.exit(1) }
  ok('上传完成')

  log('REMOTE', '执行远程部署…')
  const remoteScript = [
    `mkdir -p ${DEPLOY_PROJECT_DIR}`,
    `cd ${DEPLOY_PROJECT_DIR} && tar -xzf /tmp/chattodo-deploy.tar.gz`,
    'rm -f /tmp/chattodo-deploy.tar.gz',
    `mkdir -p ${DEPLOY_PGLITE_DIR}`,
    `cd ${DEPLOY_PROJECT_DIR}/server && npm install --omit=dev`,
    `kill $(ss -tlnp 2>/dev/null | grep ':${DEPLOY_API_PORT}' | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p') 2>/dev/null || true`,
    'sleep 1',
    `cd ${DEPLOY_PROJECT_DIR}/server`,
    `nohup env PORT=${DEPLOY_API_PORT} HOST=0.0.0.0 DB_PATH=${DEPLOY_DB_PATH} PGLITE_DIR=${DEPLOY_PGLITE_DIR} DEFAULT_USER_ID=${DEPLOY_DEFAULT_USER_ID} node src/server.js > ${DEPLOY_PROJECT_DIR}/server.log 2>&1 &`,
    'sleep 3',
  ].join(' && ')

  try {
    const out = await ssh(remoteScript)
    if (out) console.log(out)
  } catch {
    fail('远程部署失败'); process.exit(1)
  }

  log('VERIFY', '验证部署…')
  try {
    const health = await ssh(`curl -s http://127.0.0.1:${DEPLOY_API_PORT}/api/health`)
    ok(`API 健康检查: ${health}`)
  } catch {
    warn('API 健康检查失败，请查看服务器日志')
  }

  try {
    const status = await ssh(`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${DEPLOY_PORT}/`)
    if (status === '200') ok(`前端 HTTP ${status}`)
    else warn(`前端返回 HTTP ${status}`)
  } catch {
    warn('前端访问检查失败（nginx 可能未配或端口未开）')
  }

  try { unlinkSync(DEPLOY_TAR) } catch {}

  console.log(`\n${C.yellow}────────────────────────────────────────${C.reset}`)
  console.log(`${C.yellow}  如果首次部署或改过端口，需在服务器上配置 nginx:${C.reset}`)
  console.log(`${C.yellow}  $ npm run deploy:nginx${C.reset}`)
  console.log(`${C.yellow}────────────────────────────────────────${C.reset}\n`)

  console.log(`${C.bold}${C.green}✓ 部署完成！${C.reset}`)
  console.log(`  前端: http://${DEPLOY_HOST}:${DEPLOY_PORT}`)
  console.log(`  API:  http://${DEPLOY_HOST}:${DEPLOY_PORT}/api/`)
  console.log()
}

main().catch(err => { fail(err.message); process.exit(1) })
