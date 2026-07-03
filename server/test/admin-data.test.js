import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp } from './helpers.js'

const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })

test('admin overview: admin sees users with stats; member gets 403', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '管理员', 'a@x.com') // first → admin
  const b = await reg(app, '成员', 'b@x.com')
  await app.inject({ method: 'POST', url: '/api/capture', headers: H(b.token), payload: { text: '下周三前提交上线报告' } })

  const denied = await app.inject({ url: '/api/admin/overview', headers: H(b.token) })
  assert.equal(denied.statusCode, 403)

  const ov = (await app.inject({ url: '/api/admin/overview', headers: H(a.token) })).json()
  assert.equal(ov.users.length, 2)
  const bu = ov.users.find((u) => u.email === 'b@x.com')
  assert.equal(bu.taskCount, 1)

  const detail = (await app.inject({ url: `/api/admin/users/${bu.id}`, headers: H(a.token) })).json()
  assert.equal(detail.records.length, 1)
  assert.equal(detail.records[0].aiKind, 'task')
  assert.ok(detail.records[0].resultTitle)
})

test('AI config: member PUT → 403; admin PUT → 200; member GET still works', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '管理员', 'a@x.com')
  const b = await reg(app, '成员', 'b@x.com')
  const denied = await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(b.token), payload: { provider: 'openai', model: 'x' } })
  assert.equal(denied.statusCode, 403)
  const ok = await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', model: 'x', baseUrl: 'https://llm.example.com/v1' } })
  assert.equal(ok.statusCode, 200)
  const got = (await app.inject({ url: '/api/ai/config', headers: H(b.token) })).json()
  assert.equal(got.model, 'x') // members can read (masked), just not write
  assert.equal(got.hasKey, false)
})

test('change password: wrong old → 400; new password logs in', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '甲', 'a@x.com')
  const bad = await app.inject({ method: 'POST', url: '/api/auth/password', headers: H(a.token), payload: { oldPassword: 'nope', newPassword: 'newpass66' } })
  assert.equal(bad.statusCode, 400)
  const ok = await app.inject({ method: 'POST', url: '/api/auth/password', headers: H(a.token), payload: { oldPassword: 'pass1234', newPassword: 'newpass66' } })
  assert.equal(ok.statusCode, 200)
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.com', password: 'newpass66' } })
  assert.equal(login.statusCode, 200)
})

test('export returns the user data; clear wipes it (settings survive)', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '甲', 'a@x.com')
  await app.inject({ method: 'POST', url: '/api/capture', headers: H(a.token), payload: { text: '下周三前提交上线报告' } })

  const exp = (await app.inject({ url: '/api/export', headers: H(a.token) })).json()
  assert.equal(exp.tasks.length, 1)
  assert.ok(exp.appSettings)

  const cleared = (await app.inject({ method: 'POST', url: '/api/data/clear', headers: H(a.token) })).json()
  assert.equal(cleared.ok, true)
  const st = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.equal(st.tasks.length, 0)
  assert.equal(st.chat.length, 1) // fresh "cleared" message
  assert.ok(st.appSettings.workspaceMode) // settings kept
})

test('settings: notifPrefs + theme persist round-trip', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '甲', 'a@x.com')
  const upd = (await app.inject({ method: 'PUT', url: '/api/settings', headers: H(a.token), payload: { notifPrefs: { due: false, done: true }, theme: 'dark' } })).json()
  assert.equal(upd.theme, 'dark')
  assert.equal(upd.notifPrefs.due, false)
  const got = (await app.inject({ url: '/api/settings', headers: H(a.token) })).json()
  assert.equal(got.theme, 'dark')
  assert.equal(got.notifPrefs.due, false)
  assert.equal(got.notifPrefs.done, true)
})
