import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { NOTIFICATIONS_DDL, type Queryable } from '@linx/infra-notifications-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeNotificationsPlugin } from '../src/routes/notifications.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/notifications', async () => [{ from: 'legacy' }])
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeNotificationsPlugin({ db })],
    registry: new RouteRegistry({ groups: { notifications: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of NOTIFICATIONS_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(
    `INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at)
     VALUES ('nt_1','uA','friend','ph-handshake','var(--accent)','A 通过了你的好友请求',0,null,null,0,'2026-07-15T09:00:00'),
            ('nt_2','uA','done','ph-check-circle','var(--accent)','B 完成了「写方案」',0,null,null,0,'2026-07-15T09:05:00'),
            ('nt_x','uOther','x','x','x','别人的',0,null,null,0,'2026-07-15T09:00:00')`,
  )
})
afterEach(async () => {
  await client.close()
})

describe('Notifications facade (registry notifications=new)', () => {
  it('GET returns the user’s notifications as an array, DESC, excluding others', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: auth })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.map((n: { id: string }) => n.id)).toEqual(['nt_2', 'nt_1'])
      expect(body[0]).toMatchObject({ type: 'done', read: false })
    } finally {
      await app.close()
    }
  })

  it('POST read-all marks every notification read', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: auth })).json()).toEqual({ ok: true })
      const list = (await app.inject({ method: 'GET', url: '/api/notifications', headers: auth })).json()
      expect(list.every((n: { read: boolean }) => n.read)).toBe(true)
      // 其他用户不受影响
      const other = await db.execute<{ read: number }>(`SELECT read FROM notifications WHERE user_id = 'uOther'`)
      expect(other[0]?.read).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('POST :id/read marks a single notification', async () => {
    const app = await buildWith('new')
    try {
      await app.inject({ method: 'POST', url: '/api/notifications/nt_1/read', headers: auth })
      const list = (await app.inject({ method: 'GET', url: '/api/notifications', headers: auth })).json()
      expect(list.find((n: { id: string }) => n.id === 'nt_1').read).toBe(true)
      expect(list.find((n: { id: string }) => n.id === 'nt_2').read).toBe(false)
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/notifications' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('registry notifications=legacy → fall through', async () => {
    const app = await buildWith('legacy')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/notifications', headers: auth })).json()).toEqual([{ from: 'legacy' }])
    } finally {
      await app.close()
    }
  })
})
