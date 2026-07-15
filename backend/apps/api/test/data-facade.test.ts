import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import { PROJECTS_DDL } from '@linx/infra-projects-pg'
import { SETTINGS_DDL } from '@linx/infra-settings-pg'
import { CONVERSATIONS_DDL } from '@linx/infra-conversations-pg'
import { SOCIAL_DDL } from '@linx/infra-social-pg'
import { AI_ERRORS_DDL } from '@linx/infra-ai-errors-pg'
import { NOTIFICATIONS_DDL } from '@linx/infra-notifications-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeDataPlugin } from '../src/routes/data.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable
let idc = 0

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/export', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}
async function build(): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeDataPlugin({ db, clock: () => new Date('2026-07-15T09:00:00'), genId: (p) => `${p}_t${++idc}` })],
    registry: new RouteRegistry({ groups: { data: 'new' } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of [...TASKS_DDL, ...PROJECTS_DDL, ...SETTINGS_DDL, ...CONVERSATIONS_DDL, ...SOCIAL_DDL, ...AI_ERRORS_DDL, ...NOTIFICATIONS_DDL]) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO app_settings (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO agent_profile (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO tasks (id,user_id,title,tags,status,privacy_scope,priority,created_at,updated_at) VALUES ('t1','uA','写方案','[]','todo','work',3,'2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ('conv_uA','uA','默认对话','2026-07-10T09:00:00.000','2026-07-10T09:00:00.000'),('conv_extra','uA','另一个','2026-07-10T09:00:00.000','2026-07-10T09:00:00.000')`)
  await client.query(`INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ('m1','uA','conv_uA','user','买牛奶',0,'2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,handled,created_at) VALUES ('n1','uA','due','ph-clock','x','到期了',0,0,'2026-07-10T09:00:00')`)
  idc = 0
})
afterEach(async () => {
  await client.close()
})

describe('Data facade (group data)', () => {
  it('GET /api/export dumps the user data', async () => {
    const app = await build()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/export', headers: auth })
      expect(res.statusCode).toBe(200)
      const dump = res.json()
      expect(dump.user).toMatchObject({ id: 'uA' })
      expect(dump.tasks).toHaveLength(1)
      expect(dump.exportedAt).toBeTruthy()
      expect(dump).toHaveProperty('friendships')
      expect(dump).toHaveProperty('agentProfile')
    } finally {
      await app.close()
    }
  })

  it('POST /api/data/clear wipes business data, keeps default conv + writes restart msg', async () => {
    const app = await build()
    try {
      expect((await app.inject({ method: 'POST', url: '/api/data/clear', headers: auth })).json()).toEqual({ ok: true })
      expect(await db.execute(`SELECT * FROM tasks WHERE user_id = 'uA'`)).toHaveLength(0)
      expect(await db.execute(`SELECT * FROM notifications WHERE user_id = 'uA'`)).toHaveLength(0)
      // 非默认会话被删；默认会话保留 + 一条重启语
      const convs = await db.execute<{ id: string }>(`SELECT id FROM conversations WHERE user_id = 'uA'`)
      expect(convs.map((c) => c.id)).toEqual(['conv_uA'])
      const msgs = await db.execute<{ text: string }>(`SELECT text FROM chat_messages WHERE user_id = 'uA'`)
      expect(msgs).toHaveLength(1)
      expect(msgs[0]?.text).toContain('数据已清空')
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401; registry data=legacy → fall through', async () => {
    const appNew = await build()
    try {
      expect((await appNew.inject({ method: 'GET', url: '/api/export' })).statusCode).toBe(401)
    } finally {
      await appNew.close()
    }
    const appLegacy = await buildApi({
      legacyApp: await legacyStub(),
      migratedPlugins: [makeDataPlugin({ db })],
      registry: new RouteRegistry({ groups: { data: 'legacy' } }),
      auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
    })
    try {
      expect((await appLegacy.inject({ method: 'GET', url: '/api/export', headers: auth })).json()).toEqual({ from: 'legacy' })
    } finally {
      await appLegacy.close()
    }
  })
})
