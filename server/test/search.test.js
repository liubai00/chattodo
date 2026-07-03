import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('GET /api/search matches tasks + projects', async () => {
  const { app } = await makeTestApp()
  const r = (await app.inject({ url: '/api/search?q=' + encodeURIComponent('MVP') })).json()
  assert.ok(r.results.some((x) => x.type === 'task'))
  assert.ok(r.results.some((x) => x.type === 'project'))
})

test('GET /api/search empty query → no results', async () => {
  const { app } = await makeTestApp()
  assert.equal((await app.inject({ url: '/api/search?q=' })).json().results.length, 0)
})

test('GET /api/mentions matches tasks by query', async () => {
  const { app } = await makeTestApp()
  const r = (await app.inject({ url: '/api/mentions?q=' + encodeURIComponent('接口') })).json()
  assert.ok(r.results.some((x) => x.type === 'task' && x.label.includes('接口')))
})

test('GET /api/mentions empty query returns items (projects + tasks)', async () => {
  const { app } = await makeTestApp()
  const r = (await app.inject({ url: '/api/mentions?q=' })).json()
  assert.ok(r.results.length > 0)
  assert.ok(r.results.some((x) => x.type === 'project'))
})
