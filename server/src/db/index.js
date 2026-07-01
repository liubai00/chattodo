import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(here, 'schema.sql')

export function applySchema(db) {
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
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
