import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTestApp } from './helpers.js'
import { detectIntent, parseTaskCommand } from '../src/services/triage/ruleProvider.js'

const say = (app, message) =>
  app.inject({ method: 'POST', url: '/api/chat', payload: { message } }).then((r) => r.json())

// ---- 纯函数：命令解析 ----
test('parseTaskCommand parses the four modify shapes; leaves new-task inputs alone', () => {
  assert.deepEqual(parseTaskCommand('把写周报改名为写月报'), { op: 'title', target: '写周报', value: '写月报' })
  assert.equal(parseTaskCommand('把写周报设为P1').op, 'priority')
  assert.equal(parseTaskCommand('把写周报设为P1').value, 1)
  assert.equal(parseTaskCommand('把写周报改成高优先级').value, 1)
  assert.equal(parseTaskCommand('把写周报改到明天').op, 'due')
  assert.equal(parseTaskCommand('开始执行写周报').op, 'status')
  assert.equal(parseTaskCommand('把写周报设为进行中').value, 'in_progress')
  // 不误伤新建："开始健身计划" / 普通描述 → 不是修改命令
  assert.equal(parseTaskCommand('开始健身计划'), null)
  assert.equal(parseTaskCommand('明天下午三点开产品评审会'), null)
  assert.equal(detectIntent('开始健身计划'), 'capture')
})

test('rule chat full CRUD: create → read → update(due/priority/status/rename) → delete', async () => {
  const { app } = await makeTestApp()
  // C — 新建（capture）
  const c = await say(app, '下周三前提交季度总结报告')
  assert.equal(c.entities[0].type, 'task')
  const id = c.entities[0].entity.id
  const title = c.entities[0].entity.title

  // R — 查询（read）
  const q = await say(app, '有哪些任务')
  assert.equal(q.intent, 'query')
  assert.ok(q.reply.includes(title) || q.reply.includes('未完成'))

  // U1 — 改期
  const r1 = await say(app, `把${title}改到明天`)
  assert.equal(r1.intent, 'modify')
  assert.ok(r1.performed.some((p) => p.type === 'update_task'))
  const due = new Date(r1.entities[0].entity.dueAt)
  const tomo = new Date(); tomo.setDate(tomo.getDate() + 1)
  assert.equal(due.getDate(), tomo.getDate())

  // U2 — 改优先级
  const r2 = await say(app, `把${title}设为P1`)
  assert.equal(r2.entities[0].entity.priority, 1)

  // U3 — 开始执行
  const r3 = await say(app, `开始执行${title}`)
  assert.equal(r3.entities[0].entity.status, 'in_progress')

  // U4 — 改名
  const r4 = await say(app, `把${title}改名为季度总结V2`)
  assert.equal(r4.entities[0].entity.title, '季度总结V2')

  // D — 删除
  const r5 = await say(app, '删除季度总结V2')
  assert.equal(r5.intent, 'delete')
  assert.ok(r5.reply.includes('已删除'))

  // 确认已删除
  const detail = await app.inject({ url: `/api/tasks/${id}` })
  assert.equal(detail.statusCode, 404)
})

test('modify with no matching task → clear prompt, no accidental create', async () => {
  const { app } = await makeTestApp()
  const before = (await app.inject({ url: '/api/tasks' })).json().length
  const r = await say(app, '把不存在的任务XYZ改到明天')
  assert.equal(r.intent, 'modify')
  assert.ok(r.reply.includes('没找到'))
  const after = (await app.inject({ url: '/api/tasks' })).json().length
  assert.equal(after, before) // 未误建任务
})
