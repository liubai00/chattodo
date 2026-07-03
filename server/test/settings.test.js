import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('GET/PUT /api/agent merges patch, preserves other fields', async () => {
  const { app } = await makeTestApp()
  const before = (await app.inject({ url: '/api/agent' })).json()
  assert.ok(before.soul)
  const after = (await app.inject({ method: 'PUT', url: '/api/agent', payload: { soul: '新人格' } })).json()
  assert.equal(after.soul, '新人格')
  assert.equal(after.memory, before.memory)
})

test('GET/PUT /api/settings toggles workspace + privacy', async () => {
  const { app } = await makeTestApp()
  const s = (await app.inject({ url: '/api/settings' })).json()
  assert.equal(s.workspaceMode, 'work')
  assert.equal(s.privacyMode, false)
  const upd = (await app.inject({ method: 'PUT', url: '/api/settings', payload: { privacyMode: true, workspaceMode: 'personal' } })).json()
  assert.equal(upd.privacyMode, true)
  assert.equal(upd.workspaceMode, 'personal')
})

test('privacy mode filters tasks across state / tasks / plan', async () => {
  const { app } = await makeTestApp()
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { privacyMode: true, workspaceMode: 'work' } })

  const state = (await app.inject({ url: '/api/state' })).json()
  assert.ok(state.tasks.some((t) => t.id === 'task_gym'), 'raw list still has personal task')
  assert.ok(!state.visible.tasks.some((t) => t.id === 'task_gym'), 'visible excludes personal')

  const tasks = (await app.inject({ url: '/api/tasks?view=all' })).json()
  assert.ok(!tasks.some((t) => t.id === 'task_gym'), '/api/tasks privacy-filtered')

  const plan = (await app.inject({ method: 'POST', url: '/api/plan' })).json()
  assert.ok(!plan.plan.some((p) => p.task.id === 'task_gym'), 'plan excludes personal')
})
