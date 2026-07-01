import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'

// Stub global.fetch to return an OpenAI-compatible response whose content is `obj` (JSON).
function stubLlm(obj) {
  const orig = global.fetch
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() { return { choices: [{ message: { content: JSON.stringify(obj) } }] } },
    async text() { return '' },
  })
  return () => { global.fetch = orig }
}

async function useOpenAI(app) {
  await app.inject({ method: 'PUT', url: '/api/ai/config', payload: { provider: 'openai', baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' } })
}

test('agent chat: model intent → creates a task in the DB', async () => {
  const { app, db } = makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '好的，已加到任务里。', actions: [{ type: 'create_task', title: '写下周周报', priority: 2 }] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '帮我记一下下周要写周报' } })).json()
    assert.equal(res.intent, 'agent')
    assert.ok(res.agentMessage.text.includes('好的'))
    assert.ok(res.actions.some((a) => a.type === 'create_task'))
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE title='写下周周报'").get().c, 1)
    // generation record written for traceability
    const t = db.prepare("SELECT id FROM tasks WHERE title='写下周周报'").get()
    assert.ok(db.prepare('SELECT COUNT(*) AS c FROM capture_records WHERE result_entity_id=?').get(t.id).c >= 1)
  } finally { restore() }
})

test('agent chat: model completes an existing task by id', async () => {
  const { app, db } = makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '已标记完成 ✓', actions: [{ type: 'complete_task', id: 'task_api' }] })
  try {
    await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '把整理接口清单标记完成' } })
    assert.equal(db.prepare("SELECT status FROM tasks WHERE id='task_api'").get().status, 'done')
  } finally { restore() }
})

test('agent chat: plan action appends the schedule to the reply', async () => {
  const { app } = makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '这是接下来的安排：', actions: [{ type: 'plan' }] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '接下来两小时做什么' } })).json()
    assert.ok(res.actions.some((a) => a.type === 'plan'))
    assert.match(res.agentMessage.text, /\d\.\s/) // numbered plan lines appended
  } finally { restore() }
})

test('chat falls back to rule engine when the LLM call fails', async () => {
  const { app, db } = makeTestApp()
  await useOpenAI(app)
  const orig = global.fetch
  global.fetch = async () => { throw new Error('network down') }
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '下周三前提交 MVP 文档评审' } })).json()
    assert.ok(res.agentMessage.text.includes('todo 主系统')) // rule template reply
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c, 6) // task still created
  } finally { global.fetch = orig }
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM ai_errors').get().c >= 1)
})

test('rule chat still used when provider is rule (default)', async () => {
  const { app } = makeTestApp()
  const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '接下来两小时做什么？' } })).json()
  assert.equal(res.intent, 'plan')
})
