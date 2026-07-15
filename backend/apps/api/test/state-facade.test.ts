import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import { PROJECTS_DDL } from '@linx/infra-projects-pg'
import { SETTINGS_DDL } from '@linx/infra-settings-pg'
import { CONVERSATIONS_DDL } from '@linx/infra-conversations-pg'
import { NOTIFICATIONS_DDL } from '@linx/infra-notifications-pg'
import { COLLAB_DDL } from '@linx/infra-collab-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeStatePlugin } from '../src/routes/state.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable
let idc = 0

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/state', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}
async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeStatePlugin({ db, clock: () => new Date('2026-07-15T09:00:00'), genId: (p) => `${p}_t${++idc}` })],
    registry: new RouteRegistry({ groups: { state: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of [...TASKS_DDL, ...PROJECTS_DDL, ...SETTINGS_DDL, ...CONVERSATIONS_DDL, ...NOTIFICATIONS_DDL, ...COLLAB_DDL]) await client.exec(s)
  await client.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, created_at TEXT)`)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO app_settings (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO agent_profile (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ('conv_uA','uA','默认对话','2026-07-10T09:00:00.000','2026-07-10T09:00:00.000')`)
  await client.query(`INSERT INTO tasks (id,user_id,title,tags,status,due_at,privacy_scope,priority,created_at,updated_at) VALUES
    ('t1','uA','写方案','[]','todo','2026-07-14T18:00:00','work',3,'2026-07-10T09:00:00','2026-07-10T09:00:00'),
    ('t2','uA','买菜','[]','todo','2026-07-15T18:00:00','personal',3,'2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO todo_ideas (id,user_id,title,raw_text,status,privacy_scope,created_at,updated_at) VALUES ('i1','uA','研究','原文','clarifying','work','2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO projects (id,user_id,name,created_at,updated_at) VALUES ('p1','uA','项目一','2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ('m1','uA','conv_uA','user','买牛奶',0,'2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,result_entity_type,result_entity_id,status,created_at) VALUES ('cr1','uA','买牛奶','chat','task','task','t9','done','2026-07-10T09:00:00')`)
  idc = 0
})
afterEach(async () => {
  await client.close()
})

describe('State facade — GET /api/state (aggregate snapshot)', () => {
  it('returns full snapshot: entities + conversations + visible + backlink', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/state', headers: auth })
      expect(res.statusCode).toBe(200)
      const s = res.json()
      expect(s.user).toMatchObject({ id: 'uA' })
      expect(s.tasks).toHaveLength(2)
      expect(s.todoIdeas).toHaveLength(1)
      expect(s.projects).toHaveLength(1)
      expect(s.activeConversationId).toBe('conv_uA')
      expect(s.conversations[0]).toMatchObject({ id: 'conv_uA' })
      // 历史回链：user 消息「买牛奶」→ task t9
      expect(s.chat[0]).toMatchObject({ role: 'user', text: '买牛奶', refType: 'task', refId: 't9' })
      // 隐私模式关闭 → visible == 全量
      expect(s.visible.tasks).toHaveLength(2)
    } finally {
      await app.close()
    }
  })

  it('generates due/overdue notifications (dedup per day)', async () => {
    const app = await buildWith('new')
    try {
      await app.inject({ method: 'GET', url: '/api/state', headers: auth })
      // t1 due 7/14 < today 7/15 → 逾期；t2 due 7/15 == today → 今天到期
      const notifs = await db.execute<{ text: string; icon: string }>(`SELECT text, icon FROM notifications WHERE user_id = 'uA' AND type = 'due' ORDER BY text`)
      expect(notifs).toHaveLength(2)
      expect(notifs.some((n) => n.icon === 'ph-warning-circle')).toBe(true) // 逾期
      expect(notifs.some((n) => n.icon === 'ph-clock')).toBe(true) // 今天到期
      // 再次调用 → existsToday 去重，不重复生成
      await app.inject({ method: 'GET', url: '/api/state', headers: auth })
      expect(await db.execute(`SELECT * FROM notifications WHERE user_id = 'uA' AND type = 'due'`)).toHaveLength(2)
    } finally {
      await app.close()
    }
  })

  it('privacy mode filters visible by workspace', async () => {
    await client.query(`UPDATE app_settings SET privacy_mode = 1, workspace_mode = 'work' WHERE user_id = 'uA'`)
    const app = await buildWith('new')
    try {
      const s = (await app.inject({ method: 'GET', url: '/api/state', headers: auth })).json()
      // 全量 tasks 仍是 2，但 visible 只留 work（t1），t2 personal 隐藏
      expect(s.tasks).toHaveLength(2)
      expect(s.visible.tasks.map((t: { id: string }) => t.id)).toEqual(['t1'])
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401; registry state=legacy → fall through', async () => {
    const appNew = await buildWith('new')
    try {
      expect((await appNew.inject({ method: 'GET', url: '/api/state' })).statusCode).toBe(401)
    } finally {
      await appNew.close()
    }
    const appLegacy = await buildWith('legacy')
    try {
      expect((await appLegacy.inject({ method: 'GET', url: '/api/state', headers: auth })).json()).toEqual({ from: 'legacy' })
    } finally {
      await appLegacy.close()
    }
  })
})
