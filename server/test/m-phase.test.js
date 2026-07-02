import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeTestApp, makeAuthApp } from './helpers.js'
import { runBackup } from '../src/db/backup.js'
import { createDb, applySchema } from '../src/db/index.js'

const say = (app, message) => app.inject({ method: 'POST', url: '/api/chat', payload: { message } }).then((r) => r.json())
const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })

// ---- M1 澄清闭环 ----
test('clarify loop: idea + follow-up answer → converted task; 跳过 keeps it', async () => {
  const { app, db } = makeTestApp()
  db.prepare(`DELETE FROM todo_ideas`).run() // clear seeded (old) ideas
  const first = await say(app, '有空研究一下竞品的移动端交互')
  assert.equal(first.entities[0].type, 'todo_idea')
  const ideaId = first.entities[0].entity.id
  // follow-up answer (not a task itself) → converts
  const second = await say(app, '目标是输出一份对比文档，下周五前完成')
  assert.equal(second.intent, 'clarify_convert')
  assert.equal(second.entities[0].type, 'task')
  assert.equal(db.prepare(`SELECT status FROM todo_ideas WHERE id = ?`).get(ideaId).status, 'converted')
  assert.ok(second.entities[0].entity.notes.includes('补充：'))
})

test('clarify loop: 「跳过」 keeps the idea clarifying', async () => {
  const { app, db } = makeTestApp()
  db.prepare(`DELETE FROM todo_ideas`).run()
  const first = await say(app, '有空了解一下 RAG 检索方案')
  const ideaId = first.entities[0].entity.id
  const second = await say(app, '跳过')
  assert.equal(second.intent, 'clarify_skip')
  assert.equal(db.prepare(`SELECT status FROM todo_ideas WHERE id = ?`).get(ideaId).status, 'clarifying')
})

// ---- M2 项目归属 ----
test('projects: create via API; capture auto-attaches by name match', async () => {
  const { app } = makeTestApp()
  const p = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '官网改版', description: '' } })).json()
  assert.ok(p.id)
  const dup = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '官网改版' } })
  assert.equal(dup.statusCode, 409)
  const res = await say(app, '明天下午三点提交官网改版的首页稿')
  assert.equal(res.entities[0].type, 'task')
  assert.equal(res.entities[0].entity.projectId, p.id)
})

// ---- M3 登录限流 ----
test('rate limit: 11th login attempt for same email → 429', async () => {
  const { app } = makeAuthApp()
  await reg(app, '甲', 'rl@x.com')
  let last
  for (let i = 0; i < 11; i++) {
    last = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'rl@x.com', password: 'wrong' } })
  }
  assert.equal(last.statusCode, 429)
  // different email unaffected
  const other = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'other@x.com', password: 'wrong' } })
  assert.equal(other.statusCode, 401)
})

// ---- M3 备份 ----
test('backup: creates a dated snapshot next to the db', async () => {
  const dir = join(process.cwd(), 'test', '.tmp')
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'bk.db')
  if (existsSync(dbPath)) unlinkSync(dbPath)
  const db = createDb(dbPath); applySchema(db); db.close()
  const dest = await runBackup(dbPath, 3)
  assert.ok(existsSync(dest))
  const check = createDb(dest)
  assert.ok(check.prepare(`SELECT COUNT(*) c FROM users`).get().c >= 0) // valid sqlite file with schema
  check.close()
})

// ---- M4 计划落地 ----
test('plan commit: writes sequential plannedAt + activity', async () => {
  const { app, db } = makeTestApp()
  const plan = (await app.inject({ method: 'POST', url: '/api/plan', payload: {} })).json()
  const items = plan.plan.map((p) => ({ id: p.task.id, minutes: p.minutes }))
  const res = (await app.inject({ method: 'POST', url: '/api/plan/commit', payload: { items } })).json()
  assert.equal(res.updated.length, items.length)
  assert.ok(res.updated.every((t) => t.plannedAt))
  assert.ok(new Date(res.updated[1].plannedAt) > new Date(res.updated[0].plannedAt))
  assert.ok(db.prepare(`SELECT COUNT(*) c FROM activity WHERE text = '加入执行计划'`).get().c >= items.length)
})

// ---- M5 拆分 + 去重 ----
test('multi-split: newline list → one entity per line', async () => {
  const { app } = makeTestApp()
  const res = await say(app, '明天上午交周报\n周五前订会议室\n下周一发布版本公告')
  assert.equal(res.entities.length, 3)
  assert.ok(res.reply.includes('拆成 3 条'))
})

test('duplicate capture: same title warns instead of creating; resend forces', async () => {
  const { app, db } = makeTestApp()
  const before = db.prepare(`SELECT COUNT(*) c FROM tasks`).get().c
  await say(app, '明天下午三点交季度报告')
  const dup = await say(app, '明天下午三点交季度报告')
  assert.equal(dup.intent, 'duplicate')
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM tasks`).get().c, before + 1) // not created twice
  const forced = await say(app, '明天下午三点交季度报告') // third send: prev user msg identical → force
  assert.equal(forced.intent, 'capture')
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM tasks`).get().c, before + 2)
})

// ---- M6 历史回链 ----
test('state: user chat messages carry refType/refId of generated entity', async () => {
  const { app } = makeTestApp()
  const res = await say(app, '下周三前提交回链验证报告')
  const taskId = res.entities[0].entity.id
  const st = (await app.inject({ url: '/api/state' })).json()
  const userMsg = st.chat.filter((m) => m.role === 'user').find((m) => m.text === '下周三前提交回链验证报告')
  assert.equal(userMsg.refType, 'task')
  assert.equal(userMsg.refId, taskId)
})

// ---- M7 团队 ----
test('team: directory + assign notification + comment @mention', async () => {
  const { app } = makeAuthApp()
  const a = await reg(app, '张三', 'a@x.com')
  const b = await reg(app, '李四', 'b@x.com')
  const team = (await app.inject({ url: '/api/team', headers: H(a.token) })).json()
  assert.equal(team.users.length, 2)
  // A creates a task, assigns to 李四 → B gets a notification
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '协作测试任务' } })).json()
  await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: H(a.token), payload: { assignee: '李四' } })
  let sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.ok(sb.notifications.some((n) => n.text.includes('指派给你')))
  // comment @李四 → another notification
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/comments`, headers: H(a.token), payload: { text: '@李四 看一下这个' } })
  sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.ok(sb.notifications.some((n) => n.text.includes('提到了你')))
})

// ---- M8 个人 Key ----
test('per-user AI config: own overrides team, delete falls back', async () => {
  const { app } = makeAuthApp()
  const a = await reg(app, '管理员', 'a@x.com')
  const b = await reg(app, '成员', 'b@x.com')
  await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', model: 'team-model', baseUrl: 'https://t/v1', apiKey: 'tk' } })
  // member sees team config as effective
  let got = (await app.inject({ url: '/api/ai/config', headers: H(b.token) })).json()
  assert.equal(got.source, 'team')
  assert.equal(got.model, 'team-model')
  // member sets own
  await app.inject({ method: 'PUT', url: '/api/ai/config/own', headers: H(b.token), payload: { provider: 'openai', model: 'my-model', baseUrl: 'https://m/v1', apiKey: 'mk' } })
  got = (await app.inject({ url: '/api/ai/config', headers: H(b.token) })).json()
  assert.equal(got.source, 'own')
  assert.equal(got.model, 'my-model')
  assert.equal(got.team.model, 'team-model')
  // admin still sees team as effective (no own row)
  const ga = (await app.inject({ url: '/api/ai/config', headers: H(a.token) })).json()
  assert.equal(ga.source, 'team')
  // member clears own → back to team
  await app.inject({ method: 'DELETE', url: '/api/ai/config/own', headers: H(b.token) })
  got = (await app.inject({ url: '/api/ai/config', headers: H(b.token) })).json()
  assert.equal(got.source, 'team')
})
