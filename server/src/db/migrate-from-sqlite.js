import { existsSync } from 'node:fs'
import { config } from '../config.js'

// 一次性数据迁移：把旧 SQLite 库整表拷进空的 Postgres。
// 仅当 PG 为空、SQLite 文件存在且有用户时执行；幂等（ON CONFLICT DO NOTHING）。
// FK 安全顺序：先 users，再其余引用它的表。
const TABLES = [
  'users', 'sessions', 'projects', 'tasks', 'todo_ideas', 'non_todo_outputs',
  'agent_profile', 'app_settings', 'capture_records', 'corrections', 'ai_errors',
  'chat_messages', 'ai_config', 'subtasks', 'comments', 'activity', 'notifications',
  'task_collaborators', 'auto_rules',
]

export async function migrateFromSqlite(driver, sqlitePath = config.dbPath) {
  if (!sqlitePath || sqlitePath === ':memory:' || !existsSync(sqlitePath)) return 0
  let Database
  try { ({ default: Database } = await import('better-sqlite3')) } catch { return 0 }
  let sq
  try { sq = new Database(sqlitePath, { readonly: true }) } catch { return 0 }
  try {
    const hasUsers = sq.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get()
    if (!hasUsers) return 0
    const userCount = sq.prepare('SELECT COUNT(*) c FROM users').get().c
    if (!userCount) return 0
    await driver.tx(async (t) => {
      for (const table of TABLES) {
        const exists = sq.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table)
        if (!exists) continue
        const rows = sq.prepare(`SELECT * FROM ${table}`).all()
        if (!rows.length) continue
        const cols = Object.keys(rows[0])
        const placeholders = cols.map(() => '?').join(',')
        for (const r of rows) {
          await t.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, cols.map((c) => r[c]))
        }
      }
    })
    return userCount
  } finally {
    try { sq.close() } catch { /* ignore */ }
  }
}
