import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('task detail returns subtasks/comments/activity + generation record', async () => {
  const { app } = makeTestApp()
  const d = (await app.inject({ url: '/api/tasks/task_doc/detail' })).json()
  assert.equal(d.task.id, 'task_doc')
  assert.ok(d.subtasks.length >= 2)
  assert.ok(d.comments.length >= 1)
  assert.ok(d.activity.length >= 1)
})

test('add + toggle subtask (logs activity)', async () => {
  const { app, db } = makeTestApp()
  const sub = (await app.inject({ method: 'POST', url: '/api/tasks/task_api/subtasks', payload: { text: '写用例' } })).json()
  assert.equal(sub.done, false)
  const toggled = (await app.inject({ method: 'PATCH', url: '/api/subtasks/' + sub.id })).json()
  assert.equal(toggled.done, true)
  assert.ok(db.prepare("SELECT COUNT(*) AS c FROM activity WHERE task_id='task_api'").get().c >= 1)
})

test('add comment shows in detail', async () => {
  const { app } = makeTestApp()
  await app.inject({ method: 'POST', url: '/api/tasks/task_api/comments', payload: { text: '注意边界', author: '我' } })
  const d = (await app.inject({ url: '/api/tasks/task_api/detail' })).json()
  assert.ok(d.comments.some((x) => x.text === '注意边界'))
})

test('assign via PATCH persists + logs activity', async () => {
  const { app, db } = makeTestApp()
  await app.inject({ method: 'PATCH', url: '/api/tasks/task_api', payload: { assignee: '王敏' } })
  assert.equal(db.prepare("SELECT assignee FROM tasks WHERE id='task_api'").get().assignee, '王敏')
  assert.ok(db.prepare("SELECT COUNT(*) AS c FROM activity WHERE task_id='task_api' AND text LIKE '指派%'").get().c >= 1)
})

test('delete task', async () => {
  const { app, db } = makeTestApp()
  await app.inject({ method: 'DELETE', url: '/api/tasks/task_review' })
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE id='task_review'").get().c, 0)
})

test('notifications: list + mark all read; included in state', async () => {
  const { app } = makeTestApp()
  const list = (await app.inject({ url: '/api/notifications' })).json()
  assert.ok(list.length >= 2 && list.some((n) => n.read === false))
  await app.inject({ method: 'POST', url: '/api/notifications/read-all' })
  assert.ok((await app.inject({ url: '/api/notifications' })).json().every((n) => n.read === true))
  const s = (await app.inject({ url: '/api/state' })).json()
  assert.ok(Array.isArray(s.notifications) && s.notifications.length >= 2)
})

test('capture task logs creation activity', async () => {
  const { app, db } = makeTestApp()
  const cap = (await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '下周三前提交上线报告' } })).json()
  assert.equal(cap.entityType, 'task')
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM activity WHERE task_id=?').get(cap.entity.id).c >= 1)
})
