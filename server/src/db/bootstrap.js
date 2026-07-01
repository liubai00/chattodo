// Container startup: ensure schema exists; seed only if the DB is empty.
// Safe to run on every boot (won't wipe existing data).
import { config } from '../config.js'
import { createDb, applySchema } from './index.js'
import { seedDb } from './seed.js'

const db = createDb(config.dbPath)
applySchema(db)
const count = db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c
if (count === 0) {
  seedDb(db)
  console.log('bootstrap: empty DB → seeded')
} else {
  console.log(`bootstrap: ${count} tasks present → skip seed`)
}
db.close()
