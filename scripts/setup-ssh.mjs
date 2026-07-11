#!/usr/bin/env node

/**
 * 一次性初始化部署 SSH 密钥对，并将公钥上传到服务器 authorized_keys
 *
 * 使用：npm run deploy:setup-ssh
 *
 * 仅需在 setup 阶段输入一次服务器密码；之后 deploy 全程走密钥，不再存本地密码。
 */

import { mkdirSync, existsSync, readFileSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { dirname } from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { loadDeployEnv, ROOT } from './deploy-env.mjs'
import { resolveSshKeyPath } from './remote.mjs'

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m' }
const ok = msg => console.log(`${C.green}  ✓${C.reset} ${msg}`)
const fail = msg => console.error(`${C.red}  ✗${C.reset} ${msg}`)
const info = msg => console.log(`${C.dim}  ${msg}${C.reset}`)

function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function ensureSshKey(keyPath) {
  const sshDir = dirname(keyPath)
  if (!existsSync(sshDir)) {
    mkdirSync(sshDir, { recursive: true, mode: 0o700 })
  }

  if (existsSync(keyPath)) {
    ok(`私钥已存在: ${keyPath}`)
    return
  }

  info('生成 ed25519 密钥对（无 passphrase，专用于 deploy 自动化）…')
  const result = spawnSync(
    'ssh-keygen',
    ['-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'chattodo-deploy'],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error('ssh-keygen 失败，请确认已安装 OpenSSH 客户端')
  }

  try {
    chmodSync(keyPath, 0o600)
    chmodSync(`${keyPath}.pub`, 0o644)
  } catch { /* Windows 可能不支持 chmod */ }

  ok(`密钥对已生成: ${keyPath}`)
}

function uploadPublicKey(config, keyPath) {
  const pubkey = readFileSync(`${keyPath}.pub`, 'utf-8').trim()
  const target = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}`

  const remoteCmd = [
    'mkdir -p ~/.ssh',
    'chmod 700 ~/.ssh',
    `grep -qxF ${shellQuote(pubkey)} ~/.ssh/authorized_keys 2>/dev/null`,
    `|| echo ${shellQuote(pubkey)} >> ~/.ssh/authorized_keys`,
    'chmod 600 ~/.ssh/authorized_keys',
    'echo PUBKEY_OK',
  ].join(' && ')

  console.log(`\n${C.cyan}接下来会 SSH 到 ${target}，请输入一次服务器密码以写入公钥…${C.reset}\n`)

  const result = spawnSync(
    'ssh',
    ['-o', 'StrictHostKeyChecking=accept-new', target, remoteCmd],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error('公钥上传失败')
  }
  ok('公钥已写入服务器 authorized_keys')
}

function verifyKeyAuth(config, keyPath) {
  const target = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}`
  const base = ['-i', keyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'IdentitiesOnly=yes']

  info('验证密钥登录…')
  const result = spawnSync('ssh', [...base, target, 'echo KEY_AUTH_OK'], { encoding: 'utf-8' })
  if (result.status !== 0) {
    throw new Error('密钥登录验证失败，请检查 authorized_keys')
  }
  ok('密钥登录验证通过')
}

async function main() {
  console.log(`\n${C.bold}${C.cyan}部署 SSH 密钥初始化${C.reset}\n`)

  const config = loadDeployEnv()
  const keyPath = resolveSshKeyPath(config.DEPLOY_SSH_KEY, ROOT)

  ensureSshKey(keyPath)

  console.log(`\n${C.bold}公钥:${C.reset}`)
  console.log(readFileSync(`${keyPath}.pub`, 'utf-8').trim())
  console.log()

  const rl = createInterface({ input, output })
  const answer = await rl.question('是否现在上传公钥到服务器? (setup 阶段需输入一次密码) [Y/n] ')
  rl.close()

  if (answer.trim() && /^n/i.test(answer.trim())) {
    info('已跳过上传。请手动将公钥追加到服务器 ~/.ssh/authorized_keys')
    info('完成后运行: npm run deploy')
    return
  }

  uploadPublicKey(config, keyPath)
  verifyKeyAuth(config, keyPath)

  console.log(`\n${C.green}完成。之后 npm run deploy 全程使用密钥，本地不再存储密码。${C.reset}\n`)
}

main().catch(err => {
  fail(err.message)
  process.exit(1)
})
