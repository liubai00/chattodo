import { test } from 'node:test'
import assert from 'node:assert/strict'
import { triageInputSync, detectIntent, ruleProvider } from '../src/services/triage/ruleProvider.js'
import { triageInput } from '../src/services/triage/index.js'

test('explicit task: action verb + deadline', () => {
  const r = triageInputSync('下周三前提交 MVP 文档评审')
  assert.equal(r.kind, 'task')
  assert.ok(r.dueAt, 'deadline detected')
  assert.equal(r.privacyScope, 'work')
  assert.ok(r.tags.includes('文档'))
})

test('explicit task: action verb, no deadline', () => {
  const r = triageInputSync('提交后端接口清单')
  assert.equal(r.kind, 'task')
  assert.equal(r.dueAt, null)
})

test('vague todo: action tendency but vague, no deadline', () => {
  const r = triageInputSync('研究一下 Cubox 工具')
  assert.equal(r.kind, 'todo_idea')
  assert.ok(r.suggestedNextAction)
})

test('non-todo: opinion / reference marker', () => {
  const r = triageInputSync('可以借鉴 Cubox 的稍后读体验')
  assert.equal(r.kind, 'non_todo')
  assert.equal(r.suggestedDestination, 'archive')
})

test('non-todo: default fallback when nothing matches', () => {
  const r = triageInputSync('今天天气不错')
  assert.equal(r.kind, 'non_todo')
})

test('detectIntent: plan vs capture', () => {
  assert.equal(detectIntent('接下来两小时做什么？'), 'plan')
  assert.equal(detectIntent('提交 MVP 文档评审'), 'capture')
})

test('provider.triageInput (async) and service delegate match', async () => {
  const a = await ruleProvider.triageInput('下周三前提交 MVP 文档评审')
  const b = await triageInput('下周三前提交 MVP 文档评审')
  assert.equal(a.kind, 'task')
  assert.equal(b.kind, 'task')
})
