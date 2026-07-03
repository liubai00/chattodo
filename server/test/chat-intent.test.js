import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'
import { detectIntent, extractCommandTarget } from '../src/services/triage/ruleProvider.js'

const say = (app, message) => app.inject({ method: 'POST', url: '/api/chat', payload: { message } }).then((r) => r.json())

test('detectIntent: direct commands / questions are not capture', () => {
  assert.equal(detectIntent('你好'), 'greeting')
  assert.equal(detectIntent('在吗？'), 'greeting')
  assert.equal(detectIntent('你能做什么'), 'help')
  assert.equal(detectIntent('接下来两小时做什么？'), 'plan')
  assert.equal(detectIntent('帮我规划一下'), 'plan')
  assert.equal(detectIntent('有哪些任务'), 'query')
  assert.equal(detectIntent('列出今天到期的任务'), 'query')
  assert.equal(detectIntent('把提交 MVP 文档评审标记完成'), 'complete')
  assert.equal(detectIntent('提交上线报告做完了'), 'complete')
  assert.equal(detectIntent('删除预约体检'), 'delete')
  assert.equal(detectIntent('为什么天空是蓝色的？'), 'question')
  // real content still captures
  assert.equal(detectIntent('下周三前提交 MVP 文档评审'), 'capture')
  assert.equal(detectIntent('周末研究一下 Cubox'), 'capture')
  assert.equal(detectIntent('帮我记：明天联系客户'), 'capture')
})

test('extractCommandTarget pulls the task title out of commands', () => {
  assert.equal(extractCommandTarget('把提交 MVP 文档评审标记完成'), '提交 MVP 文档评审')
  assert.equal(extractCommandTarget('完成：整理后端接口清单'), '整理后端接口清单')
  assert.equal(extractCommandTarget('把「预约本周体检」删掉'), '预约本周体检')
})

test('chat greeting / help / question do NOT create entities', async () => {
  const { app, db } = await makeTestApp()
  const before = (await db.prepare('SELECT COUNT(*) c FROM tasks').get()).c
    + (await db.prepare('SELECT COUNT(*) c FROM todo_ideas').get()).c
    + (await db.prepare('SELECT COUNT(*) c FROM non_todo_outputs').get()).c
  const g = await say(app, '你好')
  assert.equal(g.intent, 'greeting')
  assert.equal(g.entities.length, 0)
  const h = await say(app, '你能做什么')
  assert.equal(h.intent, 'help')
  const q = await say(app, '为什么天空是蓝色的？')
  assert.equal(q.intent, 'question')
  const after = (await db.prepare('SELECT COUNT(*) c FROM tasks').get()).c
    + (await db.prepare('SELECT COUNT(*) c FROM todo_ideas').get()).c
    + (await db.prepare('SELECT COUNT(*) c FROM non_todo_outputs').get()).c
  assert.equal(after, before) // nothing was captured
})

test('chat query lists open tasks without creating anything', async () => {
  const { app } = await makeTestApp()
  const res = await say(app, '有哪些任务')
  assert.equal(res.intent, 'query')
  assert.ok(res.reply.includes('未完成任务'))
  assert.ok(res.reply.includes('1.'))
  assert.equal(res.entities.length, 0)
})

test('chat complete command marks the matching task done', async () => {
  const { app, db } = await makeTestApp()
  const res = await say(app, '把整理后端接口清单标记完成')
  assert.equal(res.intent, 'complete')
  assert.equal(res.performed[0].type, 'complete_task')
  assert.equal((await db.prepare(`SELECT status FROM tasks WHERE id = 'task_api'`).get()).status, 'done')
})

test('chat complete with ambiguous / missing target asks instead of acting', async () => {
  const { app, db } = await makeTestApp()
  const res = await say(app, '把不存在的任务XYZ标记完成')
  assert.equal(res.performed.length, 0)
  assert.ok(res.reply.includes('没有找到'))
  assert.equal((await db.prepare(`SELECT COUNT(*) c FROM tasks WHERE status = 'done'`).get()).c, 1) // only the seeded done task
})

test('chat delete command removes the matching task', async () => {
  const { app, db } = await makeTestApp()
  const res = await say(app, '删除预约本周体检')
  assert.equal(res.intent, 'delete')
  assert.equal(res.performed[0].type, 'delete_task')
  assert.equal((await db.prepare(`SELECT COUNT(*) c FROM tasks WHERE id = 'task_gym'`).get()).c, 0)
})

test('time-anchored input "明天八点去吃饭" becomes a task with the right hour', async () => {
  const { app } = await makeTestApp()
  const res = await say(app, '明天八点去吃饭')
  assert.equal(res.intent, 'capture')
  assert.equal(res.entities[0].type, 'task')
  assert.match(res.entities[0].entity.dueAt, /T(08|20):00/) // 八点 parsed, not the 18:00 default
  // plain day-word statements still stay out of the todo system
  const r2 = await say(app, '今天天气不错')
  assert.equal(r2.entities[0].type, 'non_todo')
})

test('rule chat: "记住：…" writes long-term memory instead of creating a todo', async () => {
  const { app, db } = await makeTestApp()
  const res = await say(app, '记住：我习惯上午做深度工作')
  assert.equal(res.intent, 'remember')
  assert.equal(res.entities.length, 0)
  assert.ok((await db.prepare('SELECT memory FROM agent_profile').get()).memory.includes('上午做深度工作'))
})

test('chat plan still returns a plan payload', async () => {
  const { app } = await makeTestApp()
  const res = await say(app, '接下来两小时做什么？')
  assert.equal(res.intent, 'plan')
  assert.ok(Array.isArray(res.plan) && res.plan.length >= 1)
})
