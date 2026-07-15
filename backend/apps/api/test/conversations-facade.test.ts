import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { CONVERSATIONS_DDL, type Queryable } from '@linx/infra-conversations-pg'
import { TASKS_DDL } from '@linx/infra-tasks-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeConversationsPlugin } from '../src/routes/conversations.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable
let idc = 0

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/conversations', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeConversationsPlugin({ db, clock: () => new Date('2026-07-15T10:00:00.500'), genId: (p) => `${p}_t${++idc}` })],
    registry: new RouteRegistry({ groups: { conversations: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  // TASKS_DDL 提供 capture_records（历史回链）；CONVERSATIONS_DDL 提供 conversations + chat_messages。
  for (const s of [...TASKS_DDL, ...CONVERSATIONS_DDL]) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  idc = 0
  await client.query(`INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ('c1','uA','对话一','2026-07-10T09:00:00.000','2026-07-10T09:00:00.000')`)
  await client.query(`INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES
    ('m1','uA','c1','user','买牛奶',0,'2026-07-10T09:00:00'),
    ('m2','uA','c1','agent','已记录',0,'2026-07-10T09:01:00')`)
  // capture_record：user 消息「买牛奶」→ 生成 task_9
  await client.query(`INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,result_entity_type,result_entity_id,status,created_at) VALUES ('cr1','uA','买牛奶','chat','task','task','task_9','done','2026-07-10T09:00:00')`)
})
afterEach(async () => {
  await client.close()
})

describe('Conversations facade (registry conversations=new)', () => {
  it('GET list with preview + count', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/conversations', headers: auth })
      expect(res.statusCode).toBe(200)
      expect(res.json().conversations[0]).toMatchObject({ id: 'c1', lastText: '已记录', messageCount: 2 })
    } finally {
      await app.close()
    }
  })

  it('POST create', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/conversations', headers: auth, payload: { title: '新研究' } })
      expect(res.json()).toMatchObject({ title: '新研究', messageCount: 0 })
    } finally {
      await app.close()
    }
  })

  it('GET :id/messages returns messages with user→entity backlink', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/conversations/c1/messages', headers: auth })
      expect(res.statusCode).toBe(200)
      const { conversation, chat } = res.json()
      expect(conversation.id).toBe('c1')
      expect(chat).toHaveLength(2)
      // user 消息「买牛奶」带回链
      expect(chat[0]).toMatchObject({ role: 'user', text: '买牛奶', refType: 'task', refId: 'task_9' })
      // agent 消息不带回链
      expect(chat[1]).not.toHaveProperty('refId')
    } finally {
      await app.close()
    }
  })

  it('GET messages of unknown conversation → 404', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/conversations/nope/messages', headers: auth })).statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('PATCH rename (400 empty, 404 unknown)', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'PATCH', url: '/api/conversations/c1', headers: auth, payload: { title: '' } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'PATCH', url: '/api/conversations/nope', headers: auth, payload: { title: 'x' } })).statusCode).toBe(404)
      const ok = await app.inject({ method: 'PATCH', url: '/api/conversations/c1', headers: auth, payload: { title: '改名了' } })
      expect(ok.json().title).toBe('改名了')
    } finally {
      await app.close()
    }
  })

  it('DELETE removes conversation + messages', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'DELETE', url: '/api/conversations/c1', headers: auth })).json()).toEqual({ ok: true })
      const msgs = await db.execute(`SELECT * FROM chat_messages WHERE conversation_id = 'c1'`)
      expect(msgs).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401; legacy fall-through', async () => {
    const appNew = await buildWith('new')
    try {
      expect((await appNew.inject({ method: 'GET', url: '/api/conversations' })).statusCode).toBe(401)
    } finally {
      await appNew.close()
    }
    const appLegacy = await buildWith('legacy')
    try {
      expect((await appLegacy.inject({ method: 'GET', url: '/api/conversations', headers: auth })).json()).toEqual({ from: 'legacy' })
    } finally {
      await appLegacy.close()
    }
  })
})
