import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb, applySchema } from '../src/db/index.js'
import { seedDb } from '../src/db/seed.js'

test('schema + seed loads expected rows', () => {
  const db = createDb(':memory:')
  applySchema(db)
  seedDb(db)
  const count = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c
  assert.equal(count('projects'), 2)
  assert.equal(count('tasks'), 5)
  assert.equal(count('todo_ideas'), 2)
  assert.equal(count('non_todo_outputs'), 2)
  assert.equal(count('agent_profile'), 1)
  assert.equal(count('app_settings'), 1)
  assert.equal(count('chat_messages'), 1)
  db.close()
})

test('tags round-trip as JSON, booleans as integers', () => {
  const db = createDb(':memory:')
  applySchema(db)
  seedDb(db)
  const task = db.prepare(`SELECT tags FROM tasks WHERE id='task_doc'`).get()
  assert.deepEqual(JSON.parse(task.tags), ['工作', '文档'])
  const settings = db.prepare(`SELECT privacy_mode FROM app_settings`).get()
  assert.equal(settings.privacy_mode, 0)
  db.close()
})

test('seedDb is idempotent (re-run keeps counts stable)', () => {
  const db = createDb(':memory:')
  applySchema(db)
  seedDb(db)
  seedDb(db)
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM tasks`).get().c, 5)
  db.close()
})
