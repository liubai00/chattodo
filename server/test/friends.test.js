import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp, befriend } from './helpers.js'
import { createDb, applySchema } from '../src/db/index.js'

const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })
const say = (app, token, message) =>
  app.inject({ method: 'POST', url: '/api/chat', headers: H(token), payload: { message } }).then((r) => r.json())

async function trio() {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '安娜', 'fa@x.com')
  const b = await reg(app, '博文', 'fb@x.com')
  const c = await reg(app, '晨曦', 'fc@x.com')
  return { app, db, a, b, c }
}

test('friends happy path: request by email → notify → accept → mutual team visibility', async () => {
  const { app, a, b } = await trio()

  // A 按邮箱发请求（大小写不敏感）
  const r1 = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'FB@X.com' } })).json()
  assert.ok(r1.friendship && r1.friendship.status === 'pending')
  assert.equal(r1.target.name, '博文')

  // 幂等：重复发送不报错、不重复建行
  const r2 = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'fb@x.com' } })).json()
  assert.equal(r2.pending, true)

  // B 收到可操作通知 + 好友列表里出现待处理
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  const nt = sb.notifications.find((n) => n.actionType === 'friend_request')
  assert.ok(nt && nt.actionRef === r1.friendship.id && !nt.handled)
  const fb = (await app.inject({ url: '/api/friends', headers: H(b.token) })).json()
  assert.equal(fb.incoming.length, 1)
  assert.equal(fb.incoming[0].name, '安娜')
  const fa = (await app.inject({ url: '/api/friends', headers: H(a.token) })).json()
  assert.equal(fa.outgoing.length, 1)

  // 未成为好友前：/api/team 只有自己，邀请协作被 403
  const teamA0 = (await app.inject({ url: '/api/team', headers: H(a.token) })).json()
  assert.equal(teamA0.users.length, 1)
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '好友前的任务' } })).json()
  const inv0 = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })
  assert.equal(inv0.statusCode, 403)
  assert.equal(inv0.json().notFriend, true)

  // B 接受 → 双方互见、通知置为已处理、A 收到通过回执
  const resp = (await app.inject({ method: 'POST', url: `/api/friends/${r1.friendship.id}/respond`, headers: H(b.token), payload: { accept: true } })).json()
  assert.equal(resp.friendship.status, 'accepted')
  const teamA = (await app.inject({ url: '/api/team', headers: H(a.token) })).json()
  assert.deepEqual(teamA.users.map((u) => u.name).sort(), ['安娜', '博文'].sort())
  const teamB = (await app.inject({ url: '/api/team', headers: H(b.token) })).json()
  assert.equal(teamB.users.length, 2)
  const sb2 = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.ok(sb2.notifications.find((n) => n.actionType === 'friend_request').handled)
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(sa.notifications.some((n) => n.text.includes('通过了你的好友请求')))

  // 成为好友后邀请协作成功
  const inv1 = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: teamA.users.find((u) => u.name === '博文').id } })).json()
  assert.ok(inv1.collab && inv1.collab.id)
})

test('decline is silent + re-request allowed + reverse pending auto-accepts', async () => {
  const { app, a, b, c } = await trio()

  // A→C 请求，C 拒绝：A 不收到拒绝通知；C 的列表清空
  const r1 = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'fc@x.com' } })).json()
  await app.inject({ method: 'POST', url: `/api/friends/${r1.friendship.id}/respond`, headers: H(c.token), payload: { accept: false } })
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(!sa.notifications.some((n) => n.text.includes('拒绝')))
  const fc = (await app.inject({ url: '/api/friends', headers: H(c.token) })).json()
  assert.equal(fc.incoming.length + fc.friends.length, 0)

  // 拒绝后可重新发起（方向翻转也允许：C 主动来加 A）→ pending
  const r2 = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(c.token), payload: { email: 'fa@x.com' } })).json()
  assert.ok(r2.friendship && r2.friendship.status === 'pending')

  // 反向待处理自动接受：C→A pending 期间 A 也请求 C → 直接 accepted
  const r3 = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'fc@x.com' } })).json()
  assert.equal(r3.autoAccepted, true)
  const teamA = (await app.inject({ url: '/api/team', headers: H(a.token) })).json()
  assert.ok(teamA.users.some((u) => u.name === '晨曦'))

  // B 与任何人都不是好友 → team 只有自己
  const teamB = (await app.inject({ url: '/api/team', headers: H(b.token) })).json()
  assert.equal(teamB.users.length, 1)
})

test('unfriend: existing collab survives, new invite blocked; withdraw pending request', async () => {
  const { app, db, a, b } = await trio()
  await befriend(db, a.user.id, b.user.id)

  // 建立协作
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '合作中的任务' } })).json()
  const inv = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  await app.inject({ method: 'POST', url: `/api/invites/${inv.collab.id}/respond`, headers: H(b.token), payload: { accept: true } })

  // 解除好友
  const fa = (await app.inject({ url: '/api/friends', headers: H(a.token) })).json()
  assert.equal(fa.friends.length, 1)
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/friends/${fa.friends[0].friendshipId}`, headers: H(a.token) })).statusCode, 200)

  // 既有协作不受影响：B 仍能看到共享任务
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.ok(sb.tasks.some((t) => t.id === task.id))

  // 新邀请被拦（403 notFriend）
  const t2 = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '解除后的新任务' } })).json()
  const inv2 = await app.inject({ method: 'POST', url: `/api/tasks/${t2.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })
  assert.equal(inv2.statusCode, 403)

  // 撤回待处理请求：A→B 重新请求后撤回，B 的通知按钮被置灰
  const r = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'fb@x.com' } })).json()
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/friends/${r.friendship.id}`, headers: H(a.token) })).statusCode, 200)
  const sb2 = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  const nts = sb2.notifications.filter((n) => n.actionType === 'friend_request')
  assert.ok(nts.length >= 1 && nts.every((n) => n.handled))
  // B 侧无法响应已撤回的请求
  assert.equal((await app.inject({ method: 'POST', url: `/api/friends/${r.friendship.id}/respond`, headers: H(b.token), payload: { accept: true } })).statusCode, 404)
})

test('guards: no self-add, unknown email 404, bad email 400, others cannot respond', async () => {
  const { app, a, b } = await trio()
  assert.equal((await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'fa@x.com' } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'nobody@x.com' } })).statusCode, 404)
  assert.equal((await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: '不是邮箱' } })).statusCode, 400)
  // 第三方（乃至发起者自己）都不能替 addressee 响应
  const r = (await app.inject({ method: 'POST', url: '/api/friends/request', headers: H(a.token), payload: { email: 'fb@x.com' } })).json()
  assert.equal((await app.inject({ method: 'POST', url: `/api/friends/${r.friendship.id}/respond`, headers: H(a.token), payload: { accept: true } })).statusCode, 404)
  void b
})

test('chat: 加好友 by email, respond via chat, @非好友 degrades to friend request', async () => {
  const { app, db, a, b, c } = await trio()

  // 「加好友 邮箱」→ 发出请求
  const r1 = await say(app, a.token, '加好友 fb@x.com')
  assert.equal(r1.intent, 'friend')
  assert.ok(r1.reply.includes('好友请求'))
  assert.ok(r1.performed.some((p) => p.type === 'add_friend'))

  // 没带邮箱 → 引导要邮箱，而不是误建任务
  const r2 = await say(app, a.token, '帮我加个好友')
  assert.equal(r2.intent, 'friend')
  assert.ok(!(r2.entities || []).length)

  // 「参加好友婚礼」这类正常任务不被误吞
  const r3 = await say(app, a.token, '周六参加好友婚礼记得买礼物')
  assert.notEqual(r3.intent, 'friend')

  // B 在聊天里回「同意好友请求」→ 成为好友
  const r4 = await say(app, b.token, '同意好友请求')
  assert.ok(r4.reply.includes('成为好友'))
  const teamB = (await app.inject({ url: '/api/team', headers: H(b.token) })).json()
  assert.ok(teamB.users.some((u) => u.name === '安娜'))

  // A 捕获任务时 @非好友（晨曦）→ 降级为好友请求 + 如实说明
  const r5 = await say(app, a.token, '周五下午三点和 @晨曦 对一遍设计稿')
  assert.equal(r5.entities[0].type, 'task')
  assert.ok(r5.performed.some((p) => p.type === 'friend_request' && p.userName === '晨曦'))
  assert.ok(r5.reply.includes('好友请求'))
  assert.ok(!r5.performed.some((p) => p.type === 'invite'))
  const fc = (await app.inject({ url: '/api/friends', headers: H(c.token) })).json()
  assert.equal(fc.incoming.length, 1)
  void db
})

test('auto rule targeting non-friend is not created; friend target works', async () => {
  const { app, db, a, b, c } = await trio()
  await befriend(db, a.user.id, b.user.id)
  // 好友目标 → 建立规则
  const r1 = await say(app, a.token, '记住：以后合同类的任务都邀请博文')
  assert.ok(r1.performed.some((p) => p.type === 'auto_rule'))
  // 非好友目标 → 不建规则
  const r2 = await say(app, a.token, '记住：以后设计类的任务都邀请晨曦')
  assert.ok(!r2.performed.some((p) => p.type === 'auto_rule'))
  void c
})

test('schema upgrade backfills pre-existing users as mutual friends (one-time)', async () => {
  const db = await createDb({ pglite: true })
  await applySchema(db)
  // 模拟「旧库升级」：删掉 friendships 表，但留有存量用户
  await db.exec(`DROP TABLE friendships`)
  const now = new Date().toISOString()
  for (const [id, name, email] of [['u1', '甲', 'u1@x.com'], ['u2', '乙', 'u2@x.com'], ['u3', '丙', 'u3@x.com']]) {
    await db.run(`INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,'member',?)`, [id, name, email, 'h', now])
  }
  await applySchema(db) // 升级：建表 + 回填
  const { c } = await db.get(`SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted'`)
  assert.equal(Number(c), 3) // C(3,2) = 3 对
  // 再跑一次不重复回填
  await applySchema(db)
  const { c: c2 } = await db.get(`SELECT COUNT(*) AS c FROM friendships`)
  assert.equal(Number(c2), 3)
  await db.close()
})
