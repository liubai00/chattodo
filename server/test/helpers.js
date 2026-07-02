import { createDb, applySchema } from '../src/db/index.js'
import { seedDb } from '../src/db/seed.js'
import { buildApp } from '../src/app.js'

// Build an app backed by a fresh, seeded in-memory DB (full test isolation).
// auth:false → requests without a token fall back to the default user, so
// endpoint tests don't need to register/login first. Auth tests use makeAuthApp.
export function makeTestApp() {
  const db = createDb(':memory:')
  applySchema(db)
  seedDb(db)
  const app = buildApp({ db, logger: false, auth: false })
  return { app, db }
}

// Auth enabled (production behavior), empty DB.
export function makeAuthApp() {
  const db = createDb(':memory:')
  applySchema(db)
  const app = buildApp({ db, logger: false })
  return { app, db }
}
