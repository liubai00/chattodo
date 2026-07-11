#!/usr/bin/env node

/**
 * 一次性保存部署密码（Windows DPAPI 加密，仅当前用户可解密）
 *
 * 使用：npm run deploy:setup-auth
 */

import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { loadDeployEnv } from './deploy-env.mjs'
import { saveDeploySecret, resolveSecretPath } from './secrets.mjs'

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', bold: '\x1b[1m' }
const ok = msg => console.log(`${C.green}  ✓${C.reset} ${msg}`)
const fail = msg => console.error(`${C.red}  ✗${C.reset} ${msg}`)

async function main() {
  console.log(`\n${C.bold}${C.cyan}部署凭证初始化${C.reset}\n`)

  if (process.platform !== 'win32') {
    fail('部署凭证加密仅支持 Windows')
    process.exit(1)
  }

  const config = loadDeployEnv()
  const secretFile = resolveSecretPath(config.DEPLOY_SECRET_FILE)

  const rl = createInterface({ input, output })
  const password = await rl.question(`请输入 ${config.DEPLOY_USER}@${config.DEPLOY_HOST} 的 SSH 密码: `)
  rl.close()

  if (!password) {
    fail('密码不能为空')
    process.exit(1)
  }

  saveDeploySecret(password, secretFile)
  ok(`凭证已加密保存到 ${config.DEPLOY_SECRET_FILE}`)
  console.log(`\n${C.green}完成。运行 npm run deploy 即可部署。${C.reset}\n`)
}

main().catch(err => {
  fail(err.message)
  process.exit(1)
})
