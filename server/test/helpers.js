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

// 直接把两个用户写成已接受的好友（协作类测试的前置：邀请/指派只在好友间可用）。
let _frSeq = 0
export async function befriend(db, aId, bId) {
  const now = new Date().toISOString()
  await db.run(
    `INSERT INTO friendships (id,requester_id,addressee_id,status,created_at,responded_at) VALUES (?,?,?,'accepted',?,?)`,
    [`fr_test_${++_frSeq}_${Math.random().toString(36).slice(2, 8)}`, aId, bId, now, now],
  )
}
