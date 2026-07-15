import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { IDENTITY_DDL, type Queryable } from '@linx/infra-identity-pg'
import { SETTINGS_DDL } from '@linx/infra-settings-pg'
import { CONVERSATIONS_DDL } from '@linx/infra-conversations-pg'
import { createSessionStore, type SessionStore } from '@linx/platform-auth'
import { createMemoryRateLimiter } from '@linx/platform-ratelimit'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeAuthPlugin } from '../src/routes/auth.routes.js'

let client: PGlite
let db: Queryable
let store: SessionStore
let idc = 0

const SESSIONS_DDL = `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.post('/api/auth/login', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

/** Facade + auth 插件；authPlugin.resolveSession 与插件共用同一 SessionStore。 */
async function build(target: 'new' | 'legacy' = 'new'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeAuthPlugin({ db, sessions: store, authLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }), clock: () => new Date('2026-07-15T09:00:00'), genId: (p) => `${p}_t${++idc}` })],
    registry: new RouteRegistry({ groups: { auth: target } }),
    auth: { resolveSession: (t) => store.resolve(t) },
  })
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of [...IDENTITY_DDL, ...SETTINGS_DDL, ...CONVERSATIONS_DDL]) await client.exec(s)
  await client.exec(SESSIONS_DDL)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  store = createSessionStore({ db, clock: () => new Date('2026-07-15T09:00:00') })
  idc = 0
})
afterEach(async () => {
  await client.close()
})

describe('Auth facade (group auth) — full identity flow', () => {
  it('register: first user becomes admin, seeds defaults, returns token+user (no password)', async () => {
    const app = await build()
    try {
      const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Alice', email: 'Alice@X.io', password: 'supersecret' } })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.token).toBeTruthy()
      expect(body.user).toMatchObject({ name: 'Alice', accountName: 'Alice', email: 'alice@x.io', role: 'admin' })
      expect(body.user).not.toHaveProperty('passwordHash')
      // 播种默认：agent_profile / app_settings / 默认会话 + 欢迎语
      expect(await db.execute(`SELECT * FROM agent_profile WHERE user_id = $1`, [body.user.id])).toHaveLength(1)
      expect(await db.execute(`SELECT * FROM app_settings WHERE user_id = $1`, [body.user.id])).toHaveLength(1)
      const msgs = await db.execute<{ text: string }>(`SELECT text FROM chat_messages WHERE user_id = $1`, [body.user.id])
      expect(msgs[0]?.text).toContain('欢迎使用 LinX')
    } finally {
      await app.close()
    }
  })

  it('duplicate email → 409; bad input → 400', async () => {
    const app = await build()
    try {
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'A', email: 'a@x.io', password: 'password1' } })
      expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'B', email: 'a@x.io', password: 'password1' } })).statusCode).toBe(409)
      expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: '', email: 'x@x.io', password: 'password1' } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'X', email: 'bad', password: 'password1' } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'X', email: 'x@x.io', password: 'short' } })).statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('login: correct → token; wrong password → 401; resolves session for /me', async () => {
    const app = await build()
    try {
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Alice', email: 'a@x.io', password: 'supersecret' } })
      expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.io', password: 'wrongpass9' } })).statusCode).toBe(401)
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'A@x.io', password: 'supersecret' } })
      expect(login.statusCode).toBe(200)
      const token = login.json().token
      // 用 token 访问受保护的 /me（authPlugin 经共享 store 解析）
      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } })
      expect(me.json()).toMatchObject({ email: 'a@x.io', name: 'Alice' })
      // 无 token → 401
      expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('PATCH /me updates profile; change password revokes other sessions', async () => {
    const app = await build()
    try {
      const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Alice', email: 'a@x.io', password: 'supersecret' } })
      const t1 = reg.json().token
      const t2 = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.io', password: 'supersecret' } })).json().token
      // 改称呼
      const patched = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { authorization: `Bearer ${t2}` }, payload: { name: '阿离' } })
      expect(patched.json()).toMatchObject({ name: '阿离' })
      // 改密（用 t2 作当前会话）→ t1 被吊销、t2 保留
      const pw = await app.inject({ method: 'POST', url: '/api/auth/password', headers: { authorization: `Bearer ${t2}` }, payload: { oldPassword: 'supersecret', newPassword: 'brandnewpass' } })
      expect(pw.json()).toEqual({ ok: true })
      expect(await store.resolve(t1)).toBeUndefined() // 旧会话吊销
      expect(await store.resolve(t2)).toBeTruthy() // 当前会话保留
      // 旧密码登录失败、新密码成功
      expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.io', password: 'supersecret' } })).statusCode).toBe(401)
      expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@x.io', password: 'brandnewpass' } })).statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('logout revokes the token; registry auth=legacy → fall through', async () => {
    const app = await build()
    try {
      const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'A', email: 'a@x.io', password: 'supersecret' } })
      const token = reg.json().token
      expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${token}` } })).json()).toEqual({ ok: true })
      expect(await store.resolve(token)).toBeUndefined()
    } finally {
      await app.close()
    }
    const legacy = await build('legacy')
    try {
      expect((await legacy.inject({ method: 'POST', url: '/api/auth/login', payload: {} })).json()).toEqual({ from: 'legacy' })
    } finally {
      await legacy.close()
    }
  })
})
