import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('GET /api/tasks view filters (open / done)', async () => {
  const { app } = makeTestApp()
  const open = (await app.inject({ url: '/api/tasks?view=open' })).json()
  assert.ok(open.length >= 1 && open.every((t) => t.status !== 'done' && t.status !== 'archived'))
  const done = (await app.inject({ url: '/api/tasks?view=done' })).json()
  assert.ok(done.every((t) => t.status === 'done'))
})

test('GET /api/tasks scope + search filters', async () => {
  const { app } = makeTestApp()
  const personal = (await app.inject({ url: '/api/tasks?scope=personal' })).json()
  assert.ok(personal.length >= 1 && personal.every((t) => t.privacyScope === 'personal'))
  const found = (await app.inject({ url: '/api/tasks?search=' + encodeURIComponent('接口') })).json()
  assert.ok(found.some((t) => t.title.includes('接口')))
})

test('task lifecycle: create → patch → done → reopen', async () => {
  const { app } = makeTestApp()
  const created = (await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: '新任务', priority: 2 } })).json()
  assert.equal(created.title, '新任务')
  assert.equal(created.priority, 2)
  const patched = (await app.inject({ method: 'PATCH', url: `/api/tasks/${created.id}`, payload: { title: '改名了', tags: ['x'] } })).json()
  assert.equal(patched.title, '改名了')
  assert.deepEqual(patched.tags, ['x'])
  const done = (await app.inject({ method: 'POST', url: `/api/tasks/${created.id}/done` })).json()
  assert.equal(done.status, 'done')
  const reopened = (await app.inject({ method: 'POST', url: `/api/tasks/${created.id}/reopen` })).json()
  assert.equal(reopened.status, 'todo')
})

test('GET /api/tasks/:id returns task + generation record', async () => {
  const { app } = makeTestApp()
  const cap = (await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '紧急修改接口文档' } })).json()
  const detail = (await app.inject({ url: `/api/tasks/${cap.entity.id}` })).json()
  assert.equal(detail.task.id, cap.entity.id)
  assert.ok(detail.generationRecord)
  assert.equal(detail.generationRecord.aiKind, 'task')
  assert.equal(detail.generationRecord.rawInput, '紧急修改接口文档')
})

test('move-out: task → non_todo (corrected) + correction + relinked record', async () => {
  const { app, db } = makeTestApp()
  const cap = (await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '紧急修改接口文档' } })).json()
  const taskId = cap.entity.id
  const res = (await app.inject({ method: 'POST', url: `/api/tasks/${taskId}/move-out` })).json()
  assert.ok(res.nonTodo)
  assert.equal(res.nonTodo.corrected, true)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE id=?').get(taskId).c, 0)
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM corrections').get().c >= 1)
  const rec = db.prepare('SELECT * FROM capture_records WHERE result_entity_id=?').get(res.nonTodo.id)
  assert.ok(rec)
  assert.equal(rec.raw_input, '紧急修改接口文档')
})

test('PATCH unknown task → 404', async () => {
  const { app } = makeTestApp()
  const res = await app.inject({ method: 'PATCH', url: '/api/tasks/nope', payload: { title: 'x' } })
  assert.equal(res.statusCode, 404)
})

test('action POST tolerates empty body with JSON content-type (browser case)', async () => {
  const { app } = makeTestApp()
  const cap = (await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '紧急修改接口文档' } })).json()
  const res = await app.inject({
    method: 'POST',
    url: `/api/tasks/${cap.entity.id}/move-out`,
    headers: { 'content-type': 'application/json' },
    payload: '',
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().nonTodo.corrected, true)
})
