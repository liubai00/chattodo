import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('POST /api/plan returns ordered plan, excludes done', async () => {
  const { app } = makeTestApp()
  const res = (await app.inject({ method: 'POST', url: '/api/plan', payload: {} })).json()
  assert.ok(Array.isArray(res.plan) && res.plan.length >= 1)
  assert.ok(res.plan.every((p) => p.task.status !== 'done'))
  assert.ok(!res.plan.some((p) => p.task.id === 'task_done'))
  assert.ok(res.totalMinutes > 0)
  // due soonest first: task_api (+1d) before task_doc (+2d)
  const ids = res.plan.map((p) => p.task.id)
  assert.ok(ids.indexOf('task_api') < ids.indexOf('task_doc'))
})

test('chat plan intent: returns plan + persists user & agent messages', async () => {
  const { app, db } = makeTestApp()
  const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '接下来两小时做什么？' } })).json()
  assert.equal(res.intent, 'plan')
  assert.ok(res.agentMessage.text.includes('建议'))
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get().c, 3) // welcome + user + agent
})

test('chat capture intent: triages, creates entity, replies', async () => {
  const { app, db } = makeTestApp()
  const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '下周三前提交 MVP 文档评审' } })).json()
  assert.equal(res.intent, 'capture')
  assert.equal(res.entities[0].result.kind, 'task')
  assert.equal(res.entities[0].type, 'task')
  assert.ok(res.agentMessage.text.includes('todo 主系统'))
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c >= 6)
})

test('chat rejects empty message', async () => {
  const { app } = makeTestApp()
  assert.equal((await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '  ' } })).statusCode, 400)
})
