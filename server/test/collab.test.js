import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp } from './helpers.js'

const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })
const say = (app, token, message) =>
  app.inject({ method: 'POST', url: '/api/chat', headers: H(token), payload: { message } }).then((r) => r.json())

async function setup() {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '李俊', 'a@x.com')
  const b = await reg(app, '张伟', 'b@x.com')
  return { app, db, a, b }
}

test('collab happy path: invite → pending → accept → shared visibility & status sync', async () => {
  const { app, a, b } = await setup()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '确认合同条款', dueAt: new Date(Date.now() + 86400000).toISOString() } })).json()

  // invite
  const inv = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  assert.ok(inv.collab.id)
  assert.equal(inv.userName, '张伟')

  // B sees pending invite + actionable notification + injected chat message
  const invites = (await app.inject({ url: '/api/invites', headers: H(b.token) })).json()
  assert.equal(invites.invites.length, 1)
  assert.equal(invites.invites[0].taskTitle, '确认合同条款')
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  const nt = sb.notifications.find((n) => n.actionType === 'invite')
  assert.ok(nt && nt.actionRef === inv.collab.id && !nt.handled)
  assert.ok(sb.chat.some((m) => m.role === 'agent' && m.text.includes('邀请你协作')))
  assert.equal(sb.tasks.length, 0) // not visible before accepting

  // B accepts → task visible with collab source; notification handled; A gets receipt
  const resp = (await app.inject({ method: 'POST', url: `/api/invites/${inv.collab.id}/respond`, headers: H(b.token), payload: { accept: true } })).json()
  assert.equal(resp.collab.status, 'accepted')
  const sb2 = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb2.tasks.length, 1)
  assert.equal(sb2.tasks[0].collabFrom, '李俊')
  assert.ok(sb2.notifications.find((n) => n.actionType === 'invite').handled)
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(sa.notifications.some((n) => n.text.includes('接受了')))

  // B completes the task → A sees done
  await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: H(b.token), payload: { status: 'done' } })
  const sa2 = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.equal(sa2.tasks.find((t) => t.id === task.id).status, 'done')

  // B cannot edit title (collaborator = status only) nor delete
  await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: H(b.token), payload: { title: '篡改标题' } })
  const t2 = (await app.inject({ url: `/api/tasks/${task.id}`, headers: H(a.token) })).json()
  assert.equal(t2.task.title, '确认合同条款')
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}`, headers: H(b.token) })).statusCode, 403)

  // B comments → A sees it in detail
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/comments`, headers: H(b.token), payload: { text: '条款我看过了' } })
  const detail = (await app.inject({ url: `/api/tasks/${task.id}/detail`, headers: H(a.token) })).json()
  assert.ok(detail.comments.some((c) => c.text === '条款我看过了' && c.author === '张伟'))
})

test('decline: not visible, inviter notified, re-invite within 24h blocked (429)', async () => {
  const { app, a, b } = await setup()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '整理竞品清单' } })).json()
  const inv = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  await app.inject({ method: 'POST', url: `/api/invites/${inv.collab.id}/respond`, headers: H(b.token), payload: { accept: false } })
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb.tasks.length, 0)
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(sa.notifications.some((n) => n.text.includes('婉拒')))
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).statusCode, 429)
})

test('idempotent invite + personal-scope needs confirm + cannot invite self', async () => {
  const { app, a, b } = await setup()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '公开任务' } })).json()
  const i1 = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  const i2 = (await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  assert.equal(i2.reused, true)
  assert.equal(i1.collab.id, i2.collab.id)
  const p = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '私人安排', privacyScope: 'personal' } })).json()
  const guard = await app.inject({ method: 'POST', url: `/api/tasks/${p.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })
  assert.equal(guard.statusCode, 409)
  assert.equal(guard.json().needConfirm, true)
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${p.id}/invite`, headers: H(a.token), payload: { userId: b.user.id, force: true } })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: a.user.id } })).statusCode, 400)
})

test('chat: "@张伟" in capture invites; B replies 接受 in chat to join', async () => {
  const { app, a, b } = await setup()
  const res = await say(app, a.token, '周五下午三点和 @张伟 对一遍合同条款')
  assert.equal(res.entities[0].type, 'task')
  assert.ok(res.performed.some((p) => p.type === 'invite' && p.userName === '张伟'))
  assert.ok(res.reply.includes('协作邀请'))
  // B responds via chat
  const r2 = await say(app, b.token, '接受')
  assert.equal(r2.intent, 'respond_invite')
  assert.ok(r2.reply.includes('已加入'))
  assert.equal(r2.entities[0].type, 'task')
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb.tasks.length, 1)
})

test('owner deletes shared task → collaborator loses it and gets notified; leave works', async () => {
  const { app, a, b } = await setup()
  const t1 = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '要删除的协作任务' } })).json()
  const inv = (await app.inject({ method: 'POST', url: `/api/tasks/${t1.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  await app.inject({ method: 'POST', url: `/api/invites/${inv.collab.id}/respond`, headers: H(b.token), payload: { accept: true } })
  await app.inject({ method: 'DELETE', url: `/api/tasks/${t1.id}`, headers: H(a.token) })
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb.tasks.length, 0)
  assert.ok(sb.notifications.some((n) => n.text.includes('已被') && n.text.includes('删除')))
  // leave flow
  const t2 = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '会退出的任务' } })).json()
  const inv2 = (await app.inject({ method: 'POST', url: `/api/tasks/${t2.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })).json()
  await app.inject({ method: 'POST', url: `/api/invites/${inv2.collab.id}/respond`, headers: H(b.token), payload: { accept: true } })
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${t2.id}/leave`, headers: H(b.token) })).statusCode, 200)
  const sb2 = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.equal(sb2.tasks.length, 0)
  const sa = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.ok(sa.notifications.some((n) => n.text.includes('退出了')))
})
