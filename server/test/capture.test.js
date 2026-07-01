import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('POST /api/capture → task: persists + writes capture_record', async () => {
  const { app, db } = makeTestApp()
  const res = await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '下周三前提交 MVP 文档评审', source: 'web' } })
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.entityType, 'task')
  assert.equal(body.result.kind, 'task')

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(body.entity.id)
  assert.ok(row, 'task persisted')

  const rec = db.prepare('SELECT * FROM capture_records WHERE result_entity_id = ?').get(body.entity.id)
  assert.ok(rec, 'generation record written')
  assert.equal(rec.ai_kind, 'task')
  assert.equal(rec.raw_input, '下周三前提交 MVP 文档评审')
  await app.close()
})

test('POST /api/capture → todo_idea and non_todo route correctly', async () => {
  const { app } = makeTestApp()
  const idea = await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '研究一下 Cubox 工具' } })
  assert.equal(idea.json().entityType, 'todo_idea')
  const non = await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '可以借鉴 Cubox 的稍后读体验' } })
  assert.equal(non.json().entityType, 'non_todo')
  await app.close()
})

test('GET /api/state returns all collections + visible', async () => {
  const { app } = makeTestApp()
  const s = (await app.inject({ method: 'GET', url: '/api/state' })).json()
  assert.equal(s.tasks.length, 5)
  assert.equal(s.todoIdeas.length, 2)
  assert.equal(s.nonTodoOutputs.length, 2)
  assert.equal(s.projects.length, 2)
  assert.equal(s.chat.length, 1)
  assert.ok(s.agentProfile.soul)
  assert.equal(s.appSettings.workspaceMode, 'work')
  assert.ok(s.visible.tasks)
  await app.close()
})

test('captured task shows up in GET /api/state', async () => {
  const { app } = makeTestApp()
  await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '紧急联系客户确认需求' } })
  const s = (await app.inject({ method: 'GET', url: '/api/state' })).json()
  assert.ok(s.tasks.some((t) => t.title.includes('联系客户')))
  await app.close()
})

test('POST /api/capture rejects empty text', async () => {
  const { app } = makeTestApp()
  const res = await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '   ' } })
  assert.equal(res.statusCode, 400)
  await app.close()
})
