import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

test('GET /api/todo-ideas returns seeded ideas', async () => {
  const { app } = await makeTestApp()
  assert.equal((await app.inject({ url: '/api/todo-ideas' })).json().length, 2)
})

test('idea convert → task carries sourceIdeaId + rawText, idea marked converted', async () => {
  const { app } = await makeTestApp()
  const out = (await app.inject({ method: 'POST', url: '/api/todo-ideas/idea_research/convert' })).json()
  assert.equal(out.task.sourceIdeaId, 'idea_research')
  assert.equal(out.task.notes, '周末研究一下 Cubox、OmniFocus、Todoist')
  assert.equal(out.idea.status, 'converted')
})

test('idea archive + discard', async () => {
  const { app, db } = await makeTestApp()
  const arch = (await app.inject({ method: 'POST', url: '/api/todo-ideas/idea_blog/archive' })).json()
  assert.equal(arch.status, 'archived')
  await app.inject({ method: 'POST', url: '/api/todo-ideas/idea_research/discard' })
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM todo_ideas WHERE id='idea_research'").get()).c, 0)
})

test('non-todo convert-to-todo creates task + removes non', async () => {
  const { app, db } = await makeTestApp()
  const out = (await app.inject({ method: 'POST', url: '/api/non-todo-outputs/non_cubox/convert-to-todo' })).json()
  assert.equal(out.task.notes, 'AI todo app 可以借鉴 Cubox 的稍后读体验')
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM non_todo_outputs WHERE id='non_cubox'").get()).c, 0)
})

test('non-todo discard', async () => {
  const { app, db } = await makeTestApp()
  await app.inject({ method: 'POST', url: '/api/non-todo-outputs/non_quote/discard' })
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM non_todo_outputs WHERE id='non_quote'").get()).c, 0)
})

test('convert unknown idea → 404', async () => {
  const { app } = await makeTestApp()
  assert.equal((await app.inject({ method: 'POST', url: '/api/todo-ideas/nope/convert' })).statusCode, 404)
})
