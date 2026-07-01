import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'

test('GET /api/health returns ok', async () => {
  const app = buildApp({ logger: false })
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().ok, true)
  await app.close()
})
