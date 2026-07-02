import { pathToFileURL } from 'node:url'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createDb } from './index.js'
import { config } from '../config.js'

// Online backup via better-sqlite3's backup API (safe while the app is running).
// Keeps the newest `keep` daily snapshots under <db dir>/backups/.
export async function runBackup(dbPath = config.dbPath, keep = 14) {
  if (dbPath === ':memory:') throw new Error('cannot backup an in-memory db')
  const db = createDb(dbPath)
  try {
    const dir = join(dirname(dbPath), 'backups')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const dest = join(dir, `chattodo-${stamp}.db`)
    await db.backup(dest)
    const files = readdirSync(dir).filter((f) => /^chattodo-\d{8}\.db$/.test(f)).sort()
    while (files.length > keep) unlinkSync(join(dir, files.shift()))
    return dest
  } finally {
    db.close()
  }
}

// CLI: `node src/db/backup.js`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup().then((dest) => console.log('backup ->', dest)).catch((e) => { console.error('backup failed:', e.message); process.exit(1) })
}
