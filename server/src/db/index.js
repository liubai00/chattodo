import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(here, 'schema.sql')

export function applySchema(db) {
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
  // Idempotent column additions for DBs created before a column existed.
  const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name)
  if (!taskCols.includes('assignee')) db.exec('ALTER TABLE tasks ADD COLUMN assignee TEXT')
  const setCols = db.prepare('PRAGMA table_info(app_settings)').all().map((c) => c.name)
  if (!setCols.includes('notif_prefs')) db.exec(`ALTER TABLE app_settings ADD COLUMN notif_prefs TEXT NOT NULL DEFAULT '{}'`)
  if (!setCols.includes('theme')) db.exec(`ALTER TABLE app_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'`)
  const ntCols = db.prepare('PRAGMA table_info(notifications)').all().map((c) => c.name)
  if (!ntCols.includes('action_type')) db.exec('ALTER TABLE notifications ADD COLUMN action_type TEXT')
  if (!ntCols.includes('action_ref')) db.exec('ALTER TABLE notifications ADD COLUMN action_ref TEXT')
  if (!ntCols.includes('handled')) db.exec('ALTER TABLE notifications ADD COLUMN handled INTEGER NOT NULL DEFAULT 0')
  return db
}

export function createDb(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

let _db = null
// Lazily-created singleton used by the app (path from config).
export function getDb() {
  if (!_db) {
    _db = createDb(config.dbPath)
    applySchema(_db)
  }
  return _db
}
