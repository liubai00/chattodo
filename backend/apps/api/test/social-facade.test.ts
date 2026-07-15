import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { SOCIAL_DDL, type Queryable } from '@linx/infra-social-pg'
import type { RateLimiter } from '@linx/platform-ratelimit'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeSocialPlugin } from '../src/routes/social.routes.js'

const alice: AuthUser = {
  id: 'uA',
  name: '阿离',
  accountName: 'alice',
  email: 'a@x.io',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00',
}
const bella: AuthUser = { ...alice, id: 'uB', name: 'Bella', accountName: 'bella', email: 'b@x.io' }

let client: PGlite
let db: Queryable
let events: Array<{ userId: string; payload: unknown }>
let idc = 0

function steppingClock(startIso = '2026-07-15T09:00:00') {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 60_000)
}

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/friends', async () => ({ from: 'legacy-friends' }))
  app.get('/api/team', async () => ({ from: 'legacy-team' }))
  app.post('/api/friends/request', async () => ({ from: 'legacy-request' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

function socialPlugin(limiter?: RateLimiter) {
  return makeSocialPlugin({
    db,
    publish: (userId, payload) => events.push({ userId, payload }),
    clock: steppingClock(),
    genId: (p) => `${p}_t${++idc}`,
    ...(limiter ? { friendReqLimiter: limiter } : {}),
  })
}

async function buildWith(
  target: 'new' | 'legacy',
  legacy: FastifyInstance,
  limiter?: RateLimiter,
): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: legacy,
    migratedPlugins: [socialPlugin(limiter)],
    registry: new RouteRegistry({ groups: { social: target } }),
    auth: {
      resolveSession: async (tok) =>
        tok === 'tokA' ? alice : tok === 'tokB' ? bella : undefined,
    },
  })
}
const asA = { authorization: 'Bearer tokA' }
const asB = { authorization: 'Bearer tokB' }

async function seedUser(u: AuthUser): Promise<void> {
  await client.query(`INSERT INTO users (id,name,email,role,created_at) VALUES ($1,$2,$3,$4,$5)`, [
    u.id,
    u.name,
    u.email,
    u.role,
    u.createdAt,
  ])
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  await client.exec(
    `CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, created_at TEXT)`,
  )
  await client.exec(`CREATE TABLE app_settings (user_id TEXT PRIMARY KEY, friend_policy TEXT)`)
  await client.exec(
    `CREATE TABLE notifications (
      id TEXT PRIMARY KEY, user_id TEXT, type TEXT, icon TEXT, color TEXT, text TEXT,
      read INTEGER DEFAULT 0, action_type TEXT, action_ref TEXT, handled INTEGER DEFAULT 0, created_at TEXT)`,
  )
  for (const stmt of SOCIAL_DDL) await client.exec(stmt)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await seedUser(alice)
  await seedUser(bella)
  events = []
  idc = 0
})
afterEach(async () => {
  await client.close()
})

describe('Social BC facade — registry social=new', () => {
  it('POST request → pending + notification row + friends/notify events', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/request',
        headers: asA,
        payload: { email: 'B@x.io' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ friendship: { status: 'pending' }, target: { id: 'uB' } })
      // 通知落库到对方 uB
      const nt = await db.execute(`SELECT * FROM notifications WHERE user_id = 'uB'`)
      expect(nt).toHaveLength(1)
      expect(nt[0]).toMatchObject({ type: 'friend', action_type: 'friend_request', handled: 0, read: 0 })
      // eventbus：notify（含 kind） + friends
      const kinds = events.filter((e) => e.userId === 'uB').map((e) => (e.payload as { kind: string }).kind)
      expect(kinds).toEqual(['notify', 'friends'])
    } finally {
      await app.close()
    }
  })

  it('GET /api/friends shows outgoing for requester, incoming for target', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'b@x.io' } })
      const a = await app.inject({ method: 'GET', url: '/api/friends', headers: asA })
      expect(a.json().outgoing.map((x: { id: string }) => x.id)).toEqual(['uB'])
      const b = await app.inject({ method: 'GET', url: '/api/friends', headers: asB })
      expect(b.json().incoming.map((x: { id: string }) => x.id)).toEqual(['uA'])
    } finally {
      await app.close()
    }
  })

  it('respond accept → accepted + requester notified + my notif handled', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      const req = await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'b@x.io' } })
      const fid = req.json().friendship.id
      events = []
      const res = await app.inject({ method: 'POST', url: `/api/friends/${fid}/respond`, headers: asB, payload: { accept: true } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ friendship: { status: 'accepted' }, requesterId: 'uA' })
      // 我(uB)这边的请求通知置 handled
      const mine = await db.execute<{ handled: number }>(`SELECT handled FROM notifications WHERE action_ref = $1 AND user_id = 'uB'`, [fid])
      expect(mine[0]?.handled).toBe(1)
      // 发起方 uA 收到 handshake 通知
      const toA = await db.execute(`SELECT * FROM notifications WHERE user_id = 'uA'`)
      expect(toA).toHaveLength(1)
      expect(toA[0]).toMatchObject({ icon: 'ph-handshake' })
    } finally {
      await app.close()
    }
  })

  it('respond to a non-existent request → 404', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      const res = await app.inject({ method: 'POST', url: '/api/friends/nope/respond', headers: asB, payload: { accept: true } })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('DELETE cancels a pending request (requester)', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      const req = await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'b@x.io' } })
      const fid = req.json().friendship.id
      const res = await app.inject({ method: 'DELETE', url: `/api/friends/${fid}`, headers: asA })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ removed: true, otherId: 'uB', wasPending: true })
      expect((await app.inject({ method: 'GET', url: '/api/friends', headers: asA })).json().outgoing).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  it('GET /api/team returns self + accepted friends only', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      // 加个陌生人 uC 不应出现在 team
      await seedUser({ ...alice, id: 'uC', name: 'Cyan', email: 'c@x.io' })
      const req = await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'b@x.io' } })
      const fid = req.json().friendship.id
      await app.inject({ method: 'POST', url: `/api/friends/${fid}/respond`, headers: asB, payload: { accept: true } })
      const team = await app.inject({ method: 'GET', url: '/api/team', headers: asA })
      const ids = team.json().users.map((u: { id: string }) => u.id).sort()
      expect(ids).toEqual(['uA', 'uB'])
    } finally {
      await app.close()
    }
  })

  it('error mapping: unknown email → 404, bad email → 400, closed → 403', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      expect((await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'ghost@x.io' } })).statusCode).toBe(404)
      expect((await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'bad' } })).statusCode).toBe(400)
      await client.query(`INSERT INTO app_settings (user_id, friend_policy) VALUES ('uB','closed')`)
      const closed = await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'b@x.io' } })
      expect(closed.statusCode).toBe(403)
    } finally {
      await app.close()
    }
  })

  it('rate limit → 429', async () => {
    const denyLimiter: RateLimiter = {
      hit: async () => ({ allowed: false, count: 16, remaining: 0, limit: 15, windowMs: 60_000 }),
      reset: async () => {},
    }
    const app = await buildWith('new', await legacyStub(), denyLimiter)
    try {
      const res = await app.inject({ method: 'POST', url: '/api/friends/request', headers: asA, payload: { email: 'b@x.io' } })
      expect(res.statusCode).toBe(429)
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401', async () => {
    const app = await buildWith('new', await legacyStub())
    try {
      expect((await app.inject({ method: 'GET', url: '/api/friends' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
})

describe('Social BC facade — registry social=legacy (fall-through)', () => {
  it('routes fall through to legacy', async () => {
    const app = await buildWith('legacy', await legacyStub())
    try {
      expect((await app.inject({ method: 'GET', url: '/api/friends', headers: asA })).json()).toEqual({ from: 'legacy-friends' })
      expect((await app.inject({ method: 'GET', url: '/api/team', headers: asA })).json()).toEqual({ from: 'legacy-team' })
    } finally {
      await app.close()
    }
  })
})
