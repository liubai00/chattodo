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
console.log('[server] 启动后端 (port 8787) …')
const server = spawn('npm', ['run', 'dev'], {
  cwd: SERVER_DIR,
  stdio: 'inherit',
  shell: true,
})

// 给后端 1 秒先启动，避免前端 proxy 请求过早失败
await new Promise(resolve => setTimeout(resolve, 1000))

// ── 4. 启动前端 ──────────────────────────────────────────────────
console.log('[vite] 启动前端 (port 3000) …')
const vite = spawn('npm', ['run', 'dev'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
})

// ── 5. 优雅退出 ──────────────────────────────────────────────────
function cleanup() {
  console.log('\n[shutdown] 正在关闭…')
  vite.kill('SIGTERM')
  server.kill('SIGTERM')
  // 二次清理：正常退出后也删掉 PID 文件，保证下次启动干净
  for (const dir of pgdataDirs) {
    const pidFile = join(dir, 'postmaster.pid')
    try { if (existsSync(pidFile)) unlinkSync(pidFile) } catch {}
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// 子进程退出时也退出父进程
server.on('exit', (code) => {
  console.log(`[server] 已退出 (code=${code})`)
  vite.kill('SIGTERM')
  process.exit(code ?? 0)
})

vite.on('exit', (code) => {
  console.log(`[vite] 已退出 (code=${code})`)
  server.kill('SIGTERM')
  process.exit(code ?? 0)
})
