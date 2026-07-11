#!/usr/bin/env node

/**
 * 单独部署/更新服务器上的 nginx 配置
 *
 * 使用：npm run deploy:nginx
 */

import { writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './deploy-env.mjs'
import { createRemoteClient } from './remote.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m' }
function log(tag, msg) { console.log(`${C.cyan}[${tag}]${C.reset} ${msg}`) }
function ok(msg) { console.log(`${C.green}  ✓${C.reset} ${msg}`) }
function fail(msg) { console.error(`${C.red}  ✗${C.reset} ${msg}`) }

async function main() {
  const config = loadDeployEnv()
  const { ssh, scp } = createRemoteClient(config, ROOT)

  const {
    DEPLOY_HOST, DEPLOY_PORT, DEPLOY_API_PORT,
    DEPLOY_PROJECT_DIR, DEPLOY_NGINX_PANEL,
  } = config

  const nginxConf = `server {
    listen ${DEPLOY_PORT};
    listen [::]:${DEPLOY_PORT};
    server_name ${DEPLOY_HOST};
    root ${DEPLOY_PROJECT_DIR}/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:${DEPLOY_API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    access_log /www/wwwlogs/chattodo.log;
    error_log /www/wwwlogs/chattodo.error.log;
}
`

  const localConf = join(ROOT, '.nginx-tmp.conf')
  writeFileSync(localConf, nginxConf, 'utf-8')

  const remotePath = DEPLOY_NGINX_PANEL === 'bt'
    ? '/www/server/panel/vhost/nginx/chattodo.conf'
    : '/etc/nginx/conf.d/chattodo.conf'

  log('NGINX', `上传配置到 ${remotePath}`)
  await scp(localConf, remotePath)

  log('NGINX', '测试并重载 nginx…')
  await ssh('nginx -t && nginx -s reload && echo RELOAD_OK')

  try { unlinkSync(localConf) } catch {}

  ok(`nginx 已重载 → http://${DEPLOY_HOST}:${DEPLOY_PORT}`)
}

main().catch(err => { fail(err.message); process.exit(1) })
