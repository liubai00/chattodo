import { existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { ROOT } from './deploy-env.mjs'

const IS_WIN = process.platform === 'win32'

export function resolveSecretPath(configPath = '.deploy-secret') {
  return isAbsolute(configPath) ? configPath : resolve(ROOT, configPath)
}

/** 使用 Windows DPAPI 加密保存（仅当前 Windows 用户可解密） */
export function saveDeploySecret(password, secretFile) {
  if (!IS_WIN) {
    throw new Error('部署凭证加密仅支持 Windows')
  }
  const escaped = password.replace(/'/g, "''")
  const pathEscaped = secretFile.replace(/'/g, "''")
  execSync(
    `$secure = ConvertTo-SecureString '${escaped}' -AsPlainText -Force; ConvertFrom-SecureString $secure | Set-Content -Path '${pathEscaped}' -NoNewline`,
    { stdio: 'pipe', shell: 'powershell.exe' },
  )
}

/** 解密部署密码（仅在内存中使用，不写入磁盘） */
export function loadDeploySecret(secretFile) {
  if (!existsSync(secretFile)) {
    throw new Error(`加密凭证不存在: ${secretFile}\n请先运行: npm run deploy:setup-auth`)
  }
  if (!IS_WIN) {
    throw new Error('部署凭证解密仅支持 Windows')
  }
  const pathEscaped = secretFile.replace(/'/g, "''")
  const ps = `$encrypted = Get-Content '${pathEscaped}' -Raw; $secure = ConvertTo-SecureString $encrypted; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))`
  return execSync(ps, { encoding: 'utf8', shell: 'powershell.exe' }).trim()
}
