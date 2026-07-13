// Container startup: ensure schema, then populate an EMPTY database once —
// migrating from a legacy SQLite file if present, otherwise seeding demo data.
// Never touches an already-populated DB. Uses the async driver (Postgres in prod).
import { getDriver } from './driver.js'
import { seedDb } from './seed.js'
import { migrateFromSqlite } from './migrate-from-sqlite.js'

const db = await getDriver()
const { c } = await db.get('SELECT COUNT(*) AS c FROM users')
if (Number(c) > 0) {
  console.log(`bootstrap: ${c} users present → skip`)
} else {
  let migrated = 0
  try { migrated = await migrateFromSqlite(db) } catch (e) { console.error('bootstrap: sqlite migration failed:', e.message) }
  if (migrated > 0) console.log(`bootstrap: migrated ${migrated} users (+ their data) from SQLite → Postgres`)
  else { await seedDb(db); console.log('bootstrap: empty DB → seeded demo data') }
}
try { await db.close() } catch (e) { console.error('bootstrap: db close failed:', e.message) }; process.exit(0)
