import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp } from './helpers.js'

const H = (t) => ({ authorization: `Bearer ${t}` })

test('account name (账户名) and salutation (称呼) are independent fields', async () => {
  const { app } = await makeAuthApp()
  const reg = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: '安娜', email: 'a@x.com', password: 'pass1234' } })).json()
  // 注册后两者都等于所填名字
  assert.equal(reg.user.name, '安娜')
  assert.equal(reg.user.accountName, '安娜')

  // 改账户名，不影响称呼
  const u1 = (await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { accountName: 'anna_01' } })).json()
  assert.equal(u1.accountName, 'anna_01')
  assert.equal(u1.name, '安娜')

  // 改称呼，不影响账户名
  const u2 = (await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { name: '娜娜' } })).json()
  assert.equal(u2.name, '娜娜')
  assert.equal(u2.accountName, 'anna_01')

  // me 返回同步
  const me = (await app.inject({ url: '/api/auth/me', headers: H(reg.token) })).json()
  assert.equal(me.name, '娜娜')
  assert.equal(me.accountName, 'anna_01')
})

test('validation: empty / oversized / illegal account name rejected', async () => {
  const { app } = await makeAuthApp()
  const reg = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: '博文', email: 'b@x.com', password: 'pass1234' } })).json()
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { accountName: '' } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { accountName: 'a'.repeat(25) } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { accountName: 'bad name!' } })).statusCode, 400)
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { name: '' } })).statusCode, 400)
})

test('greeting uses the salutation (称呼)', async () => {
  const { app } = await makeAuthApp()
  const reg = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: '博文', email: 'b@x.com', password: 'pass1234' } })).json()
  await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(reg.token), payload: { name: '小博' } })
  const res = (await app.inject({ method: 'POST', url: '/api/chat', headers: H(reg.token), payload: { message: '你好' } })).json()
  assert.equal(res.intent, 'greeting')
  assert.ok(res.reply.includes('小博'))
})
