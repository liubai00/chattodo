import { createDb, applySchema } from '../src/db/index.js'
import { seedDb } from '../src/db/seed.js'
import { buildApp } from '../src/app.js'

// Each test gets a fresh in-process Postgres (PGlite, WASM) — real PG dialect,
// no external server. Fully isolated per call.
export async function makeTestApp() {
  const db = await createDb({ pglite: true })
  await applySchema(db)
  await seedDb(db)
  const app = await buildApp({ db, logger: false, auth: false })
  return { app, db }
}

// Auth enabled (production behavior), empty DB.
export async function makeAuthApp() {
  const db = await createDb({ pglite: true })
  await applySchema(db)
  const app = await buildApp({ db, logger: false })
  return { app, db }
}
