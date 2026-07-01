import { createDb, applySchema } from '../src/db/index.js'
import { seedDb } from '../src/db/seed.js'
import { buildApp } from '../src/app.js'

// Build an app backed by a fresh, seeded in-memory DB (full test isolation).
export function makeTestApp() {
  const db = createDb(':memory:')
  applySchema(db)
  seedDb(db)
  const app = buildApp({ db, logger: false })
  return { app, db }
}
