#!/usr/bin/env node

/**
 * 一键启动脚本：清理 PGlite 残留 PID 文件 → 同时启动前后端
 *
 * 使用方法：node scripts/dev.mjs
 * 或通过 npm：npm run dev（根目录）
 */

import { spawn } from 'node:child_process'
import { unlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SERVER_DIR = join(ROOT, 'server')

// ── 1. 清理 PGlite 残留 postmaster.pid ────────────────────────────
const pgdataDirs = [
  join(SERVER_DIR, 'data', 'pgdata-fresh'),
  join(SERVER_DIR, 'data', 'pgdata'),
]

for (const dir of pgdataDirs) {
  const pidFile = join(dir, 'postmaster.pid')
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile)
      console.log(`[clean] 已删除残留 PID: ${pidFile}`)
    } catch (err) {
      console.warn(`[clean] 无法删除 ${pidFile}: ${err.message}`)
    }
  }
}

// ── 2. 清理 server/data/pgdata-fresh/postmaster.opts（也可能残留）────
for (const dir of pgdataDirs) {
  const optsFile = join(dir, 'postmaster.opts')
  if (existsSync(optsFile)) {
    try {
      unlinkSync(optsFile)
      console.log(`[clean] 已删除残留 opts: ${optsFile}`)
    } catch {
      // ignore
    }
  }
}

// ── 3. 启动后端 ──────────────────────────────────────────────────
// 直接用 node 启动（不经 npm 包装层），stdio: 'inherit' 让终端 Ctrl+C 的 SIGINT
// 直达后端进程，触发 server.js 里的优雅关闭：app.close() + PGlite syncToFs 落盘。
// 若经 npm run dev -> node --watch，Windows 下 SIGINT 不向子进程转发，后端会被
// 强杀，PGlite 半写入的数据目录下次启动 _pg_initdb 直接 Aborted()。
console.log('[server] 启动后端 (port 18787) …')
const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/server.js'], {
  cwd: SERVER_DIR,
  stdio: 'inherit',
})

// 给后端 1 秒先启动，避免前端 proxy 请求过早失败
await new Promise(resolve => setTimeout(resolve, 1000))

// ── 4. 启动前端 ──────────────────────────────────────────────────
// 同样直接跑 vite 入口（不经 npm/.cmd 包装），Ctrl+C SIGINT 直达 vite 进程。
console.log('[vite] 启动前端 (port 3000) …')
const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js')], {
  cwd: ROOT,
  stdio: 'inherit',
})

// ── 5. 优雅退出 ──────────────────────────────────────────────────
// 关键：必须给后端时间走 server.js 的优雅关闭（app.close() + PGlite syncToFs 落盘）。
// 若 kill 后立即 process.exit，后端被强杀 -> PGlite 半写入 -> 下次启动 _pg_initdb Aborted()。
// 所以 SIGINT 后等后端自行退出（最多 8s），再兜底 SIGKILL，最后清理残留 pid。
let closing = false
async function cleanup(signal) {
  if (closing) return
  closing = true
  console.log(`\n[shutdown] 收到 ${signal}，正在优雅关闭…`)
  // vite 可直接终止（无持久化状态）
  try { vite.kill('SIGTERM') } catch {}
  // 后端：终端 Ctrl+C 已通过 stdio:inherit 直达后端，server.js 的 graceful shutdown
  // （app.close + PGlite syncToFs）正在自行执行。Windows 上 server.kill('SIGINT') 实为
  // TerminateProcess（强杀），会打断 PGlite 落盘导致数据目录损坏——故不主动发信号，
  // 只等其自行退出，超时再 SIGKILL 兜底。
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000)
    server.once('exit', () => { clearTimeout(timer); resolve(true) })
  })
  if (!exited) {
    console.warn('[shutdown] 后端 8s 未退出，强制终止（数据目录可能需要下次启动重建）')
    try { server.kill('SIGKILL') } catch {}
  } else {
    console.log('[shutdown] 后端已优雅退出（PGlite 已落盘）')
  }
  // 兜底清理残留 pid（正常优雅退出不应有；防极端情况卡下次启动）
  for (const dir of pgdataDirs) {
    const pidFile = join(dir, 'postmaster.pid')
    try { if (existsSync(pidFile)) unlinkSync(pidFile) } catch {}
  }
  process.exit(0)
}

process.on('SIGINT', () => cleanup('SIGINT'))
process.on('SIGTERM', () => cleanup('SIGTERM'))

// 子进程意外退出（非 cleanup 触发）时，连带退出另一个并结束父进程。
// cleanup 进行中（closing=true）时跳过：避免 vite 被 cleanup 终止后触发此处强杀后端、
// 打断 PGlite 落盘。
server.on('exit', (code) => {
  if (closing) return
  console.log(`[server] 已退出 (code=${code})`)
  try { vite.kill('SIGTERM') } catch {}
  process.exit(code ?? 0)
})

vite.on('exit', (code) => {
  if (closing) return
  console.log(`[vite] 已退出 (code=${code})`)
  try { server.kill('SIGTERM') } catch {}
  process.exit(code ?? 0)
})
