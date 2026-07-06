import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp, befriend } from './helpers.js'

const reg = (app, name, email) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'pass1234' } }).then((r) => r.json())
const H = (t) => ({ authorization: `Bearer ${t}` })
const say = (app, token, message, conversationId) =>
  app.inject({ method: 'POST', url: '/api/chat', headers: H(token), payload: conversationId ? { message, conversationId } : { message } }).then((r) => r.json())

test('new account has one default conversation with the welcome message', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const st = (await app.inject({ url: '/api/state', headers: H(a.token) })).json()
  assert.equal(st.conversations.length, 1)
  assert.ok(st.activeConversationId)
  assert.equal(st.conversations[0].id, st.activeConversationId)
  assert.ok(st.chat.some((m) => m.role === 'agent' && m.text.includes('欢迎')))
})

test('create / list / rename / delete conversations', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const c = (await app.inject({ method: 'POST', url: '/api/conversations', headers: H(a.token), payload: { title: '工作线' } })).json()
  assert.equal(c.title, '工作线')
  let list = (await app.inject({ url: '/api/conversations', headers: H(a.token) })).json()
  assert.equal(list.conversations.length, 2)
  // rename
  await app.inject({ method: 'PATCH', url: `/api/conversations/${c.id}`, headers: H(a.token), payload: { title: '改个名' } })
  list = (await app.inject({ url: '/api/conversations', headers: H(a.token) })).json()
  assert.ok(list.conversations.find((x) => x.id === c.id).title === '改个名')
  // delete
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}`, headers: H(a.token) })).statusCode, 200)
  list = (await app.inject({ url: '/api/conversations', headers: H(a.token) })).json()
  assert.equal(list.conversations.length, 1)
})

test('messages are isolated per conversation; agent history stays within the thread', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const defaultId = (await app.inject({ url: '/api/state', headers: H(a.token) })).json().activeConversationId
  const c2 = (await app.inject({ method: 'POST', url: '/api/conversations', headers: H(a.token), payload: {} })).json()
  // 显式发到默认线与 c2 线
  const rDefault = await say(app, a.token, '默认线里的任务A', defaultId)
  const rC2 = await say(app, a.token, '第二条线里的任务B', c2.id)
  assert.equal(rDefault.conversationId, defaultId)
  assert.equal(rC2.conversationId, c2.id)
  // c2 messages contain B, not A
  const m2 = (await app.inject({ url: `/api/conversations/${c2.id}/messages`, headers: H(a.token) })).json()
  const texts2 = m2.chat.map((m) => m.text).join('\n')
  assert.ok(texts2.includes('第二条线里的任务B'))
  assert.ok(!texts2.includes('默认线里的任务A'))
  // default line contains A, not B
  const mDef = (await app.inject({ url: `/api/conversations/${rDefault.conversationId}/messages`, headers: H(a.token) })).json()
  const textsDef = mDef.chat.map((m) => m.text).join('\n')
  assert.ok(textsDef.includes('默认线里的任务A'))
  assert.ok(!textsDef.includes('第二条线里的任务B'))
})

test('first user message auto-titles the conversation; list ordered by recency', async () => {
  const { app } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const c = (await app.inject({ method: 'POST', url: '/api/conversations', headers: H(a.token), payload: {} })).json()
  assert.equal(c.title, '新对话')
  await say(app, a.token, '规划下周的产品评审', c.id)
  const list = (await app.inject({ url: '/api/conversations', headers: H(a.token) })).json()
  const got = list.conversations.find((x) => x.id === c.id)
  assert.equal(got.title, '规划下周的产品评审')
  assert.equal(list.conversations[0].id, c.id) // 最近活动置顶
})

test('cross-user injected chat lands in the target default conversation', async () => {
  const { app, db } = await makeAuthApp()
  const a = await reg(app, '安娜', 'a@x.com')
  const b = await reg(app, '博文', 'b@x.com')
  await befriend(db, a.user.id, b.user.id)
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '一起对方案' } })).json()
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })
  // B's default conversation received the invite chat message
  const st = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  assert.ok(st.chat.some((m) => m.role === 'agent' && m.text.includes('邀请你协作')))
})
