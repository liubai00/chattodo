import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..')
export const ENV_FILE = join(ROOT, '.env')

export function loadDeployEnv() {
  if (!existsSync(ENV_FILE)) {
    throw new Error('.env 文件不存在，请先复制 .env.example 为 .env')
  }

  const env = {}
  for (const line of readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }

  const {
    DEPLOY_HOST,
    DEPLOY_USER = 'root',
    DEPLOY_SSH_KEY = '.ssh/chattodo_deploy',
    DEPLOY_PORT = '9090',
    DEPLOY_API_PORT = '8787',
    DEPLOY_PROJECT_DIR = '/opt/chattodo',
    DEPLOY_DB_PATH = '/opt/chattodo/data/chattodo.db',
    DEPLOY_PGLITE_DIR = '/opt/chattodo/data/pgdata',
    DEPLOY_DEFAULT_USER_ID = 'u_default',
    DEPLOY_NGINX_PANEL = 'bt',
  } = env

  if (!DEPLOY_HOST) throw new Error('.env 缺少必填项: DEPLOY_HOST')

  return {
    DEPLOY_HOST,
    DEPLOY_USER,
    DEPLOY_SSH_KEY,
    DEPLOY_PORT,
    DEPLOY_API_PORT,
    DEPLOY_PROJECT_DIR,
    DEPLOY_DB_PATH,
    DEPLOY_PGLITE_DIR,
    DEPLOY_DEFAULT_USER_ID,
    DEPLOY_NGINX_PANEL,
  }
}
