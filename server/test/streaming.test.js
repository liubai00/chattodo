import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'
import { makeReplyExtractor } from '../src/services/triage/llmProvider.js'

// Parse an SSE payload into [{event, data}] entries.
function parseSse(text) {
  return text.split('\n\n').filter(Boolean).map((block) => {
    const ev = { event: 'message', data: null }
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) ev.event = line.slice(7).trim()
      else if (line.startsWith('data: ')) { try { ev.data = JSON.parse(line.slice(6)) } catch { ev.data = line.slice(6) } }
    }
    return ev
  })
}

test('makeReplyExtractor: emits reply chars incrementally, handles split escapes', () => {
  const got = []
  const feed = makeReplyExtractor((t) => got.push(t))
  feed('{"re')
  feed('ply"')
  feed(': "你好')
  feed('\\')            // escape split across chunks
  feed('n世界\\u4e2d')   // \u split not across here, decoded 中
  feed('"，"actions":[]}')
  assert.equal(got.join(''), '你好\n世界中')
})

test('POST /api/chat/stream (rule mode): status + done events, entity created', async () => {
  const { app, db } = makeTestApp()
  const res = await app.inject({ method: 'POST', url: '/api/chat/stream', payload: { message: '下周三前提交上线总结报告' } })
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /text\/event-stream/)
  const events = parseSse(res.payload)
  const status = events.find((e) => e.event === 'status')
  assert.equal(status.data.intent, 'capture')
  const done = events.find((e) => e.event === 'done')
  assert.equal(done.data.intent, 'capture')
  assert.equal(done.data.entities[0].type, 'task')
  assert.ok(db.prepare(`SELECT COUNT(*) c FROM tasks WHERE title LIKE '%上线总结报告%'`).get().c >= 1)
})

test('POST /api/chat/stream (LLM): deltas stream the reply, actions still execute', async () => {
  const { app, db } = makeTestApp()
  await app.inject({ method: 'PUT', url: '/api/ai/config', payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
  // stub upstream: OpenAI-compatible SSE stream of a JSON envelope
  const chunks = [
    '{"reply":"好的，',
    '已记为任务。",',
    '"actions":[{"type":"create_task","title":"流式测试任务"}]}',
  ]
  const orig = global.fetch
  global.fetch = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        for (const part of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
      },
    }),
    async text() { return '' },
  })
  let res
  try {
    res = await app.inject({ method: 'POST', url: '/api/chat/stream', payload: { message: '记个任务' } })
  } finally { global.fetch = orig }
  const events = parseSse(res.payload)
  const deltas = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('')
  assert.equal(deltas, '好的，已记为任务。')
  const done = events.find((e) => e.event === 'done')
  assert.equal(done.data.reply, '好的，已记为任务。')
  assert.ok(done.data.performed.some((p) => p.type === 'create_task'))
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM tasks WHERE title='流式测试任务'`).get().c, 1)
})

test('streaming plain-prose reply (no JSON) → done carries the full text, no failure', async () => {
  const { app } = makeTestApp()
  await app.inject({ method: 'PUT', url: '/api/ai/config', payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k', fallbackToRule: false } })
  const parts = ['我是基于大语言模型的', '任务助理，随时可以', '帮你规划和记录。']
  const orig = global.fetch
  global.fetch = async () => ({
    ok: true, status: 200,
    body: new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        for (const p of parts) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
      },
    }),
    async text() { return '' },
  })
  let res
  try {
    res = await app.inject({ method: 'POST', url: '/api/chat/stream', payload: { message: '讲讲时间管理的技巧' } })
  } finally { global.fetch = orig }
  const events = parseSse(res.payload)
  const done = events.find((e) => e.event === 'done')
  assert.equal(done.data.reply, parts.join(''))
  assert.ok(!events.some((e) => e.event === 'error'))
})

test('due notifications: generated on /api/state once per task per day', async () => {
  const { app, db } = makeTestApp()
  // seeded task_api is due tomorrow (+1d); make one due today
  const today = new Date(); today.setHours(15, 0, 0, 0)
  db.prepare(`UPDATE tasks SET due_at = ? WHERE id = 'task_api'`).run(today.toISOString())
  const s1 = (await app.inject({ url: '/api/state' })).json()
  const dueNotifs = s1.notifications.filter((n) => n.text.includes('整理后端接口清单') && n.text.includes('今天到期'))
  assert.equal(dueNotifs.length, 1)
  const s2 = (await app.inject({ url: '/api/state' })).json()
  const again = s2.notifications.filter((n) => n.text.includes('整理后端接口清单') && n.text.includes('今天到期'))
  assert.equal(again.length, 1) // deduped — not created twice
})
