import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { createDb, applySchema } from '../src/db/index.js'

test('GET /api/health returns ok', async () => {
  const db = await createDb({ pglite: true })
  await applySchema(db)
  const app = await buildApp({ db, logger: false })
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().ok, true)
  await app.close()
})
