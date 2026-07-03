import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp } from './helpers.js'

const reg = (app, name, email, password = 'pass1234') =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password } })

test('unauthenticated /api/state → 401; /api/health stays open', async () => {
  const { app } = await makeAuthApp()
  assert.equal((await app.inject({ url: '/api/state' })).statusCode, 401)
  assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200)
})

test('register → token + user; first user is admin, second is member', async () => {
  const { app } = await makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  assert.ok(a.token)
  assert.equal(a.user.role, 'admin')
  const b = (await reg(app, '乙', 'b@x.com')).json()
  assert.equal(b.user.role, 'member')
})

test('register validations: bad email / short password / duplicate email', async () => {
  const { app } = await makeAuthApp()
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'x', email: 'bad', password: 'pass1234' } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'x', email: 'a@x.com', password: '123' } })).statusCode, 400)
  await reg(app, '甲', 'a@x.com')
  assert.equal((await reg(app, '甲2', 'a@x.com')).statusCode, 409)
})

test('login: ok / wrong password / me returns user', async () => {
  const { app } = await makeAuthApp()
  await reg(app, '甲', 'a@x.com', 'secret66')
  const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.com', password: 'secret66' } })
  assert.equal(ok.statusCode, 200)
  const { token } = ok.json()
  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.com', password: 'nope' } })
  assert.equal(bad.statusCode, 401)
  const me = await app.inject({ url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } })
  assert.equal(me.json().email, 'a@x.com')
})

test('per-user data isolation: A captures a task, B sees none', async () => {
  const { app } = await makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const b = (await reg(app, '乙', 'b@x.com')).json()
  const H = (t) => ({ authorization: `Bearer ${t}` })

  await app.inject({ method: 'POST', url: '/api/capture', headers: H(a.token), payload: { text: '下周三前提交 MVP 文档评审' } })
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sa.tasks.length, 1)
  assert.equal(sb.tasks.length, 0)
  assert.equal(sa.chat.length >= 1, true) // welcome message
  assert.equal(sa.user.email, 'a@x.com')
})

test('registration creates per-user defaults (settings + agent)', async () => {
  const { app } = await makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const H = { authorization: `Bearer ${a.token}` }
  const settings = (await app.inject({ url: '/api/settings', headers: H })).json()
  assert.equal(settings.workspaceMode, 'work')
  const agent = (await app.inject({ url: '/api/agent', headers: H })).json()
  assert.ok(agent.soul)
})

test('logout invalidates the token', async () => {
  const { app } = await makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const H = { authorization: `Bearer ${a.token}` }
  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: H })
  assert.equal((await app.inject({ url: '/api/auth/me', headers: H })).statusCode, 401)
  assert.equal((await app.inject({ url: '/api/state', headers: H })).statusCode, 401)
})

test('PATCH /api/auth/me updates display name', async () => {
  const { app } = await makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const upd = (await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { authorization: `Bearer ${a.token}` }, payload: { name: '新名字' } })).json()
  assert.equal(upd.name, '新名字')
})

test('seeded demo account can log in and owns the demo data', async () => {
  const { createDb, applySchema } = await import('../src/db/index.js')
  const { seedDb } = await import('../src/db/seed.js')
  const { buildApp } = await import('../src/app.js')
  const db = await createDb({ pglite: true })
  await applySchema(db)
  await seedDb(db)
  const app = await buildApp({ db, logger: false })
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'demo@linx.team', password: 'linx2026' } })
  assert.equal(r.statusCode, 200)
  const s = (await app.inject({ url: '/api/state', headers: { authorization: `Bearer ${r.json().token}` } })).json()
  assert.equal(s.tasks.length, 5)
})
