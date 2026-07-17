// 本地开发启动器:新栈 apps/api(P8 全量权威),PGlite 零配置模式。
// vite dev 代理 /api → 18787(见 vite.config.js);数据落 ./data/pgdata-dev(gitignored)。
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
process.env.PORT ||= '18787'
process.env.PGLITE_DIR ||= path.join(root, 'data', 'pgdata-dev')
fs.mkdirSync(process.env.PGLITE_DIR, { recursive: true })

await import(new URL('../backend/apps/api/dist/main.js', import.meta.url).href)
