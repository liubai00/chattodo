import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp } from './helpers.js'
import { subscribe, publish, connectionCount } from '../src/services/events.js'

const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })
const say = (app, token, message) =>
  app.inject({ method: 'POST', url: '/api/chat', headers: H(token), payload: { message } }).then((r) => r.json())

async function pair() {
  const { app, db } = makeAuthApp()
  const a = await reg(app, '李俊', 'a@x.com')
  const b = await reg(app, '张伟', 'b@x.com')
  return { app, db, a, b }
}

// ---- O1 事件总线 ----
test('events bus: publish reaches subscriber, unsubscribe stops it, dead sockets pruned', () => {
  const frames = []
  const res = { write: (s) => frames.push(s) }
  const un = subscribe('u_test', res)
  assert.equal(connectionCount('u_test'), 1)
  assert.equal(publish('u_test', { kind: 'notify', text: 'hi' }), 1)
  assert.ok(frames[0].includes('event: notify'))
  assert.ok(frames[0].includes('"text":"hi"'))
  un()
  assert.equal(connectionCount('u_test'), 0)
  assert.equal(publish('u_test', { kind: 'notify' }), 0)
  // dead socket → pruned on publish
  const bad = { write: () => { throw new Error('closed') } }
  const un2 = subscribe('u_test2', bad)
  assert.equal(publish('u_test2', { kind: 'notify' }), 0)
  assert.equal(connectionCount('u_test2'), 0)
  un2()
})

test('GET /api/events requires auth', async () => {
  const { app } = makeAuthApp()
  assert.equal((await app.inject({ url: '/api/events' })).statusCode, 401)
})

// ---- O2 仅关注 ----
test('follow mode: not in my todo, but completion notifies me; owner gets follow receipt', async () => {
  const { app, a, b } = await pair()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '季度目标复盘' } })).json()
  const inv = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  // B 仅关注
  const r = (await app.inject({ method: 'POST', url: `/api/invites/${inv.collab.id}/respond`, headers: H(b.token), payload: { follow: true } })).json()
  assert.equal(r.collab.status, 'following')
  assert.equal(r.task, null)
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb.tasks.length, 0) // 不进 todo
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(sa.notifications.some((n) => n.text.includes('开始关注')))
  // A 完成任务 → 关注者 B 收到进展通知
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/done`, headers: H(a.token) })
  const sb2 = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.ok(sb2.notifications.some((n) => n.text.includes('完成了「季度目标复盘」')))
})

test('done by collaborator notifies owner (progress notification)', async () => {
  const { app, a, b } = await pair()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '联调支付接口' } })).json()
  const inv = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  await app.inject({ method: 'POST', url: `/api/invites/${inv.collab.id}/respond`, headers: H(b.token), payload: { accept: true } })
  await say(app, b.token, '把联调支付接口标记完成')
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(sa.notifications.some((n) => n.text === '张伟 完成了「联调支付接口」'))
})

test('chat 「关注」 responds follow via conversation', async () => {
  const { app, a, b } = await pair()
  await say(app, a.token, '明天下午四点和 @张伟 复盘营销数据')
  const r = await say(app, b.token, '关注')
  assert.equal(r.intent, 'respond_invite')
  assert.ok(r.reply.includes('已关注'))
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb.tasks.length, 0)
})

// ---- O3 detail 协作人 ----
test('task detail exposes collaborators with names and status', async () => {
  const { app, a, b } = await pair()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '排期评审' } })).json()
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })
  const detail = (await app.inject({ url: `/api/tasks/${task.id}/detail`, headers: H(a.token) })).json()
  assert.equal(detail.access, 'owner')
  assert.equal(detail.collaborators.length, 1)
  assert.equal(detail.collaborators[0].userName, '张伟')
  assert.equal(detail.collaborators[0].status, 'pending')
})

// ---- O4 自动规则 ----
test('auto rule: 记住→建规则；新任务命中关键词→自动邀请；可删除', async () => {
  const { app, a, b } = await pair()
  const r1 = await say(app, a.token, '记住：以后合同相关的任务都邀请张伟')
  assert.ok(r1.performed.some((p) => p.type === 'auto_rule'))
  assert.ok(r1.reply.includes('自动规则'))
  const rules = (await app.inject({ url: '/api/auto-rules', headers: H(a.token) })).json()
  assert.equal(rules.rules.length, 1)
  assert.equal(rules.rules[0].keyword, '合同')
  assert.equal(rules.rules[0].targetName, '张伟')

  // 命中关键词 → 自动邀请
  const r2 = await say(app, a.token, '下周三前整理合同初稿')
  assert.ok(r2.performed.some((p) => p.type === 'invite' && p.auto && p.userName === '张伟'))
  assert.ok(r2.reply.includes('自动邀请'))
  const invites = (await app.inject({ url: '/api/invites', headers: H(b.token) })).json()
  assert.equal(invites.invites.length, 1)

  // 不命中 → 不邀请
  const r3 = await say(app, a.token, '周五前预订团建场地')
  assert.ok(!r3.performed.some((p) => p.auto))

  // 删除规则后不再触发
  await app.inject({ method: 'DELETE', url: `/api/auto-rules/${rules.rules[0].id}`, headers: H(a.token) })
  const r4 = await say(app, a.token, '月底前归档合同扫描件')
  assert.ok(!r4.performed.some((p) => p.auto))
})
