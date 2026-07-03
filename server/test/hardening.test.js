import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthApp } from './helpers.js'

const reg = (app, name, email, password = 'pass1234') =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password } })
const H = (t) => ({ authorization: `Bearer ${t}` })

test('password change revokes other sessions but keeps the current one', async () => {
  const { app } = makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const second = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.com', password: 'pass1234' } })).json()
  // 两个会话都活着
  assert.equal((await app.inject({ url: '/api/auth/me', headers: H(a.token) })).statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: H(second.token) })).statusCode, 200)
  // 用第一个会话改密 → 第二个会话（"被盗 token"）必须失效，当前会话保留
  const ok = await app.inject({ method: 'POST', url: '/api/auth/password', headers: H(a.token), payload: { oldPassword: 'pass1234', newPassword: 'newpass88' } })
  assert.equal(ok.statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: H(a.token) })).statusCode, 200)
  assert.equal((await app.inject({ url: '/api/auth/me', headers: H(second.token) })).statusCode, 401)
})

test('SSRF guard: AI base URL cannot point at loopback / private ranges / bare hosts', async () => {
  const { app } = makeAuthApp()
  const a = (await reg(app, '管理员', 'a@x.com')).json()
  const bad = ['http://127.0.0.1:8788', 'http://localhost:6379', 'http://10.0.0.5/v1', 'http://192.168.1.10/v1', 'http://172.17.0.1/v1', 'http://169.254.169.254/latest', 'http://chattodo-redis:6379', 'ftp://api.example.com']
  for (const baseUrl of bad) {
    const r1 = await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl } })
    assert.equal(r1.statusCode, 400, `team config should reject ${baseUrl}`)
    const r2 = await app.inject({ method: 'PUT', url: '/api/ai/config/own', headers: H(a.token), payload: { provider: 'openai', baseUrl } })
    assert.equal(r2.statusCode, 400, `own config should reject ${baseUrl}`)
    const r3 = await app.inject({ method: 'POST', url: '/api/ai/test', headers: H(a.token), payload: { provider: 'openai', baseUrl, apiKey: 'k' } })
    assert.equal(r3.statusCode, 400, `test endpoint should reject ${baseUrl}`)
  }
  // 正常公网地址放行；留空（服务商默认）放行
  assert.equal((await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', baseUrl: 'https://api.deepseek.com/v1' } })).statusCode, 200)
  assert.equal((await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'anthropic', baseUrl: '' } })).statusCode, 200)
})

test('input limits: name ≤24 chars, password ≥8 chars', async () => {
  const { app } = makeAuthApp()
  assert.equal((await reg(app, '这个显示名称实在是太长太长太长太长太长太长太长太长太长了吧', 'n@x.com')).statusCode, 400)
  assert.equal((await reg(app, '甲', 'p@x.com', 'short7c')).statusCode, 400)
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const longName = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: H(a.token), payload: { name: 'x'.repeat(30) } })
  assert.equal(longName.statusCode, 400)
})

test('expired sessions are garbage-collected on next login', async () => {
  const { app, db } = makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  db.prepare(`INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ('dead_token', ?, '2020-01-01T00:00:00', '2020-01-31T00:00:00')`).run(a.user.id)
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM sessions WHERE token='dead_token'`).get().c, 1)
  await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.com', password: 'pass1234' } })
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM sessions WHERE token='dead_token'`).get().c, 0)
})

test('identity question is answered from real config, not the LLM (no token burned)', async () => {
  const { isIdentityQuestion, identityReply } = await import('../src/services/chat.js')
  assert.ok(isIdentityQuestion('你现在是什么模型'))
  assert.ok(isIdentityQuestion('你是什么模型'))
  assert.ok(isIdentityQuestion('你是谁'))
  assert.ok(!isIdentityQuestion('帮我买个什么模型的手办作为周五的任务')) // 太长 → 不误判为身份提问
  // rule mode
  assert.match(identityReply({ provider: 'rule' }), /离线规则模式/)
  // llm mode → 报真实型号 + 接入 host
  const r = identityReply({ provider: 'openai', model: 'deepseek-v4-flash', apiKey: 'k', baseUrl: 'https://api.deepseek.com' })
  assert.match(r, /deepseek-v4-flash/)
  assert.match(r, /api\.deepseek\.com/)
})

test('chat identity via API answers concretely even with LLM configured (no fetch call)', async () => {
  const { app } = makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  await app.inject({ method: 'PUT', url: '/api/ai/config', headers: H(a.token), payload: { provider: 'openai', model: 'deepseek-chat', apiKey: 'k', baseUrl: 'https://api.deepseek.com/v1' } })
  const orig = global.fetch
  global.fetch = async () => { throw new Error('LLM must NOT be called for identity questions') }
  try {
    const res = (await app.inject({ method: 'POST', url: '/api/chat', headers: H(a.token), payload: { message: '你是什么模型' } })).json()
    assert.equal(res.intent, 'identity')
    assert.match(res.reply, /deepseek-chat/)
  } finally { global.fetch = orig }
})

test('chat rate limit: 41st message in a minute → 429', async () => {
  const { app } = makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  let last
  for (let i = 0; i < 41; i++) {
    last = await app.inject({ method: 'POST', url: '/api/chat', headers: H(a.token), payload: { message: `第 ${i} 条消息` } })
  }
  assert.equal(last.statusCode, 429)
})

test('deleting a shared task disarms pending invite notification buttons', async () => {
  const { app } = makeAuthApp()
  const a = (await reg(app, '甲', 'a@x.com')).json()
  const b = (await reg(app, '乙', 'b@x.com')).json()
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers: H(a.token), payload: { title: '将被删除的任务' } })).json()
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/invite`, headers: H(a.token), payload: { userId: b.user.id } })
  await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}`, headers: H(a.token) })
  const sb = (await app.inject({ url: '/api/state', headers: H(b.token) })).json()
  const inviteNotif = sb.notifications.find((n) => n.actionType === 'invite')
  assert.ok(inviteNotif.handled, 'invite notification buttons should be disarmed after task deletion')
})
