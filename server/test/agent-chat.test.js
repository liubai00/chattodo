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
  await app.inject({ method: 'PUT', url: '/api/ai/config', payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
}

test('plain-prose LLM reply (no JSON envelope) degrades gracefully — not a failure', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  // 关闭兜底，复现线上配置：解析失败曾直接变成「AI 处理失败」
  await app.inject({ method: 'PUT', url: '/api/ai/config', payload: { fallbackToRule: false } })
  const prose = '我是 DeepSeek 的 todo-first 智能助理，专门帮你管理任务和想法。有什么需要规划或记录的吗？'
  const orig = global.fetch
  global.fetch = async () => ({
    ok: true, status: 200,
    async json() { return { choices: [{ message: { content: prose } }] } },
    async text() { return '' },
  })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '给我讲讲高效工作的方法' } })).json()
    assert.equal(res.reply, prose)             // 全文原样作为回复
    assert.equal(res.entities.length, 0)
    assert.ok(!res.agentMessage.text.includes('AI 处理失败'))
  } finally { global.fetch = orig }
  assert.equal((await db.prepare('SELECT COUNT(*) c FROM ai_errors').get()).c, 0) // 不再记为错误
})

test('agent chat: model intent → creates a task in the DB', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '好的，已加到任务里。', actions: [{ type: 'create_task', title: '写下周周报', priority: 2 }] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '帮我记一下下周要写周报' } })).json()
    assert.equal(res.intent, 'agent')
    assert.ok(res.agentMessage.text.includes('好的'))
    assert.ok(res.performed.some((a) => a.type === 'create_task'))
    assert.equal(res.entities[0].type, 'task') // full entity returned for the frontend
    assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE title='写下周周报'").get()).c, 1)
    // generation record written for traceability
    const t = await db.prepare("SELECT id FROM tasks WHERE title='写下周周报'").get()
    assert.ok((await db.prepare('SELECT COUNT(*) AS c FROM capture_records WHERE result_entity_id=?').get(t.id)).c >= 1)
  } finally { restore() }
})

test('agent chat: model completes an existing task by id', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '已标记完成 ✓', actions: [{ type: 'complete_task', id: 'task_api' }] })
  try {
    await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '把整理接口清单标记完成' } })
    assert.equal((await db.prepare("SELECT status FROM tasks WHERE id='task_api'").get()).status, 'done')
  } finally { restore() }
})

test('agent chat: plan action appends the schedule to the reply', async () => {
  const { app } = await makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '这是接下来的安排：', actions: [{ type: 'plan' }] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '接下来两小时做什么' } })).json()
    assert.ok(res.performed.some((a) => a.type === 'plan'))
    assert.match(res.agentMessage.text, /\d\.\s/) // numbered plan lines appended
  } finally { restore() }
})

test('agent chat: tolerant action parsing (alias / single-key / nested shapes)', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  // "add_task" alias + payload at top level
  let restore = stubLlm({ reply: '好的', actions: [{ action: 'add_task', title: '别名任务A' }] })
  try { await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '随便' } }) } finally { restore() }
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM tasks WHERE title='别名任务A'").get()).c, 1)
  // single-key form {"create_task": {...}}
  restore = stubLlm({ reply: '好的', actions: [{ create_task: { title: '单键任务B' } }] })
  try { await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '随便' } }) } finally { restore() }
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM tasks WHERE title='单键任务B'").get()).c, 1)
})

test('honesty guard: reply claims "已添加" with empty actions → capture actually happens', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '已添加任务：明天晚上八点去吃饭。', actions: [] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '明天八点去吃饭' } })).json()
    assert.equal(res.entities.length, 1) // guard captured it for real
    assert.ok(res.performed.some((p) => p.recovered))
  } finally { restore() }
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM capture_records WHERE raw_input='明天八点去吃饭'").get()).c, 1)
})

test('honesty guard: claims "已完成" but no match → appends correction, no fake state change', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '已完成「不存在的任务」。', actions: [] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '把不存在的任务XYZ标记完成' } })).json()
    assert.ok(res.reply.includes('没有实际改动'))
    assert.equal(res.performed.length, 0)
  } finally { restore() }
  assert.equal((await db.prepare(`SELECT COUNT(*) c FROM tasks WHERE status='done'`).get()).c, 1) // only seeded done task
})

test('agent chat: sends multi-turn history to the LLM (context awareness)', async () => {
  const { app } = await makeTestApp()
  await useOpenAI(app)
  // turn 1 (rule-free stub): creates a task
  let restore = stubLlm({ reply: '已记为任务', actions: [{ type: 'create_task', title: '八点吃饭' }] })
  try { await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '明天八点去吃饭' } }) } finally { restore() }
  // turn 2: capture the outgoing request body and assert history is present
  let captured = null
  const orig = global.fetch
  global.fetch = async (_u, opts) => {
    captured = JSON.parse(opts.body)
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify({ reply: '好的，已改到九点。', actions: [] }) } }] } }, async text() { return '' } }
  }
  try {
    await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '改到九点' } })
  } finally { global.fetch = orig }
  const allText = captured.messages.map((m) => m.content).join('\n')
  assert.ok(allText.includes('明天八点去吃饭'), 'prior user turn included')
  assert.ok(allText.includes('已记为任务'), 'prior assistant turn included')
  assert.ok(allText.includes('"memory"'), 'long-term memory field in context')
  assert.ok(captured.messages.length >= 3)
})

test('agent chat: remember action appends to long-term memory', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  const restore = stubLlm({ reply: '记住了', actions: [{ type: 'remember', note: '用户习惯上午做深度工作' }] })
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '记住，我习惯上午做深度工作' } })).json()
    assert.ok(res.performed.some((p) => p.type === 'remember'))
  } finally { restore() }
  const mem = (await db.prepare('SELECT memory FROM agent_profile').get()).memory
  assert.ok(mem.includes('上午做深度工作'))
})

test('chat falls back to rule engine when the LLM call fails', async () => {
  const { app, db } = await makeTestApp()
  await useOpenAI(app)
  const orig = global.fetch
  global.fetch = async () => { throw new Error('network down') }
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '下周三前提交 MVP 文档评审' } })).json()
    assert.ok(res.agentMessage.text.includes('todo 主系统')) // rule template reply
    assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM tasks').get()).c, 6) // task still created
  } finally { global.fetch = orig }
  assert.ok((await db.prepare('SELECT COUNT(*) AS c FROM ai_errors').get()).c >= 1)
})

test('rule chat still used when provider is rule (default)', async () => {
  const { app } = await makeTestApp()
  const res = (await app.inject({ method: 'POST', url: '/api/chat', payload: { message: '接下来两小时做什么？' } })).json()
  assert.equal(res.intent, 'plan')
})
