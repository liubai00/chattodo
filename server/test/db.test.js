import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb, applySchema } from '../src/db/index.js'
import { seedDb } from '../src/db/seed.js'

async function fresh() {
  const db = await createDb({ pglite: true })
  await applySchema(db)
  await seedDb(db)
  return db
}

test('schema + seed loads expected rows', async () => {
  const db = await fresh()
  const count = async (t) => (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c
  assert.equal(await count('projects'), 2)
  assert.equal(await count('tasks'), 5)
  assert.equal(await count('todo_ideas'), 2)
  assert.equal(await count('non_todo_outputs'), 2)
  assert.equal(await count('agent_profile'), 1)
  assert.equal(await count('app_settings'), 1)
  assert.equal(await count('chat_messages'), 1)
  await db.close()
})

test('tags round-trip as JSON, booleans as integers', async () => {
  const db = await fresh()
  const task = await db.get(`SELECT tags FROM tasks WHERE id='task_doc'`)
  assert.deepEqual(JSON.parse(task.tags), ['工作', '文档'])
  const settings = await db.get(`SELECT privacy_mode FROM app_settings`)
  assert.equal(settings.privacy_mode, 0)
  await db.close()
})

test('seedDb is idempotent (re-run keeps counts stable)', async () => {
  const db = await createDb({ pglite: true })
  await applySchema(db)
  await seedDb(db)
  await seedDb(db)
  assert.equal((await db.get(`SELECT COUNT(*) AS c FROM tasks`)).c, 5)
  await db.close()
})
