import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'
import { mergeResult } from '../src/services/triage/llmProvider.js'

test('GET /api/ai/config defaults to rule, no key echoed', async () => {
  const { app } = makeTestApp()
  const cfg = (await app.inject({ url: '/api/ai/config' })).json()
  assert.equal(cfg.provider, 'rule')
  assert.equal(cfg.hasKey, false)
  assert.equal(cfg.apiKey, undefined) // never echoed
})

test('PUT /api/ai/config switches provider + stores key (masked on read)', async () => {
  const { app, db } = makeTestApp()
  const upd = (await app.inject({
    method: 'PUT', url: '/api/ai/config',
    payload: { provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-secret' },
  })).json()
  assert.equal(upd.provider, 'openai')
  assert.equal(upd.model, 'deepseek-chat')
  assert.equal(upd.hasKey, true)
  assert.equal(upd.apiKey, undefined)
  // key is actually stored
  assert.equal(db.prepare("SELECT api_key FROM ai_config WHERE id='default'").get().api_key, 'sk-secret')
})

test('POST /api/ai/test with rule provider succeeds offline', async () => {
  const { app } = makeTestApp()
  const r = (await app.inject({ method: 'POST', url: '/api/ai/test', payload: { sample: '下周三前提交 MVP 文档评审' } })).json()
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'task')
})

test('capture falls back to rule + logs ai_error when the LLM call fails', async () => {
  const { app, db } = makeTestApp()
  await app.inject({ method: 'PUT', url: '/api/ai/config', payload: { provider: 'openai', baseUrl: 'https://llm.example.com/v1', model: 'm', apiKey: 'k' } })
  const orig = global.fetch
  global.fetch = async () => { throw new Error('network down') }
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/capture', payload: { text: '下周三前提交 MVP 文档评审' } })).json()
    assert.equal(res.entityType, 'task') // fell back to rule engine
  } finally {
    global.fetch = orig
  }
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM ai_errors').get().c >= 1, 'ai_error logged')
})

test('mergeResult: LLM classification + deterministic due date', () => {
  const r = mergeResult('下周三前提交 MVP 文档评审', { kind: 'task', title: '提交评审', reason: 'x', confidence: 0.9, priority: 1, tags: ['工作'] })
  assert.equal(r.kind, 'task')
  assert.equal(r.priority, 1)
  assert.ok(r.dueAt, 'due date filled deterministically')
  const n = mergeResult('随便记一下', { kind: 'non_todo', title: 't', reason: 'r' })
  assert.equal(n.kind, 'non_todo')
  assert.equal(n.suggestedDestination, 'archive')
})
