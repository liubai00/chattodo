import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { COLLAB_DDL, type Queryable } from '@linx/infra-collab-pg'
import { SOCIAL_DDL } from '@linx/infra-social-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeCollabPlugin } from '../src/routes/collab.routes.js'

const owner: AuthUser = { id: 'uOwner', name: 'Owner', accountName: 'owner', email: 'o@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }
const bob: AuthUser = { ...owner, id: 'uBob', name: 'Bob', accountName: 'bob', email: 'b@x.io' }

let client: PGlite
let db: Queryable
let events: Array<{ kind: 'one' | 'many'; userIds: string[]; payload: unknown }>
let idc = 0

function steppingClock(startIso = '2026-07-15T09:00:00') {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 60_000)
}

function plugin() {
  return makeCollabPlugin({
    db,
    publish: (userId, payload) => events.push({ kind: 'one', userIds: [userId], payload }),
    publishMany: (userIds, payload) => events.push({ kind: 'many', userIds: [...userIds], payload }),
    clock: steppingClock(),
    genId: (p) => `${p}_t${++idc}`,
  })
}

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.post('/api/tasks/:id/invite', async () => ({ from: 'legacy-invite' }))
  app.get('/api/invites', async () => ({ from: 'legacy-invites' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [plugin()],
    registry: new RouteRegistry({ groups: { collab: target } }),
    auth: { resolveSession: async (t) => (t === 'tokO' ? owner : t === 'tokB' ? bob : undefined) },
  })
}
const asO = { authorization: 'Bearer tokO' }
const asB = { authorization: 'Bearer tokB' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  await client.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, created_at TEXT)`)
  await client.exec(
    `CREATE TABLE tasks (
      id TEXT PRIMARY KEY, user_id TEXT, title TEXT, notes TEXT, status TEXT DEFAULT 'todo',
      project_id TEXT, tags TEXT DEFAULT '[]', context TEXT, due_at TEXT, planned_at TEXT,
      duration_minutes INTEGER, priority INTEGER DEFAULT 3, privacy_scope TEXT DEFAULT 'work',
      source_idea_id TEXT, assignee TEXT, created_at TEXT, updated_at TEXT)`,
  )
  await client.exec(`CREATE TABLE app_settings (user_id TEXT PRIMARY KEY, friend_policy TEXT)`)
  await client.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, icon TEXT, color TEXT, text TEXT, read INTEGER DEFAULT 0, action_type TEXT, action_ref TEXT, handled INTEGER DEFAULT 0, created_at TEXT)`)
  await client.exec(`CREATE TABLE chat_messages (id TEXT PRIMARY KEY, user_id TEXT, conversation_id TEXT, role TEXT, text TEXT, is_error INTEGER DEFAULT 0, created_at TEXT)`)
  await client.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT, updated_at TEXT)`)
  await client.exec(`CREATE TABLE activity (id TEXT PRIMARY KEY, user_id TEXT, task_id TEXT, text TEXT, created_at TEXT)`)
  for (const s of SOCIAL_DDL) await client.exec(s)
  for (const s of COLLAB_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO users (id,name,email,role,created_at) VALUES ('uOwner','Owner','o@x.io','admin','2026-01-01T00:00:00'),('uBob','Bob','b@x.io','member','2026-01-02T00:00:00'),('uCarol','Carol','c@x.io','member','2026-01-03T00:00:00')`)
  await client.query(
    `INSERT INTO tasks (id,user_id,title,notes,status,tags,due_at,priority,privacy_scope,created_at,updated_at)
     VALUES ('t1','uOwner','写方案','初稿','todo','["急"]','2026-07-20T18:00:00',2,'work','2026-07-10T09:00:00','2026-07-10T09:00:00')`,
  )
  await client.query(`INSERT INTO tasks (id,user_id,title,privacy_scope) VALUES ('tP','uOwner','私人计划','personal')`)
  await client.query(`INSERT INTO conversations (id,user_id,updated_at) VALUES ('conv_uBob','uBob','2026-07-15T08:00:00.000')`)
  events = []
  idc = 0
})
afterEach(async () => {
  await client.close()
})

async function makeFriends(a: string, b: string): Promise<void> {
  await client.query(
    `INSERT INTO friendships (id,requester_id,addressee_id,status,created_at,responded_at) VALUES ($1,$2,$3,'accepted','2026-07-01T09:00:00','2026-07-01T09:05:00')`,
    [`fr_${a}_${b}`, a, b],
  )
}

describe('Collab facade — invite', () => {
  it('invite a friend → 200, notification(invite) + chat injection + activity', async () => {
    await makeFriends('uOwner', 'uBob')
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/tasks/t1/invite', headers: asO, payload: { userId: 'uBob' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ reused: false, userName: 'Bob' })
      const nt = await db.execute(`SELECT * FROM notifications WHERE user_id = 'uBob' AND action_type = 'invite'`)
      expect(nt).toHaveLength(1)
      expect(String((nt[0] as { text: string }).text)).toContain('邀请你协作「写方案」（截止 7/20 18:00）')
      const chat = await db.execute(`SELECT * FROM chat_messages WHERE user_id = 'uBob'`)
      expect(chat).toHaveLength(1)
      const act = await db.execute(`SELECT * FROM activity WHERE task_id = 't1'`)
      expect(act).toHaveLength(1)
      // eventbus: notify(→uBob) + chat(→uBob)
      const kinds = events.map((e) => (e.payload as { kind: string }).kind)
      expect(kinds).toEqual(expect.arrayContaining(['notify', 'chat']))
    } finally {
      await app.close()
    }
  })

  it('invite a non-friend → 403 notFriend', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/tasks/t1/invite', headers: asO, payload: { userId: 'uBob' } })
      expect(res.statusCode).toBe(403)
      expect(res.json()).toMatchObject({ notFriend: true })
    } finally {
      await app.close()
    }
  })

  it('invite on a personal task without force → 409 needConfirm', async () => {
    await makeFriends('uOwner', 'uBob')
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/tasks/tP/invite', headers: asO, payload: { userId: 'uBob' } })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({ needConfirm: true })
    } finally {
      await app.close()
    }
  })
})

describe('Collab facade — invites list + respond', () => {
  async function seedInvite(): Promise<string> {
    await makeFriends('uOwner', 'uBob')
    const app = await buildWith('new')
    const r = await app.inject({ method: 'POST', url: '/api/tasks/t1/invite', headers: asO, payload: { userId: 'uBob' } })
    const id = r.json().collab.id
    await app.close()
    return id
  }

  it('GET /api/invites returns my pending with task/inviter join', async () => {
    await seedInvite()
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/invites', headers: asB })
      expect(res.statusCode).toBe(200)
      const inv = res.json().invites
      expect(inv[0]).toMatchObject({ taskTitle: '写方案', inviterName: 'Owner' })
    } finally {
      await app.close()
    }
  })

  it('respond accept → 200 accepted + inviter notified (check-circle)', async () => {
    const id = await seedInvite()
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: `/api/invites/${id}/respond`, headers: asB, payload: { accept: true, remind: true } })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toMatchObject({ collab: { status: 'accepted' }, task: { collabFrom: 'Owner', collabRemind: true } })
      // 保真：接受返回的 task 携带完整 toTask 字段（承 legacy repos.tasks.get 的 16 字段），非精简投影。
      expect(body.task).toMatchObject({
        id: 't1', title: '写方案', notes: '初稿', status: 'todo', tags: ['急'],
        priority: 2, privacyScope: 'work', createdAt: '2026-07-10T09:00:00',
      })
      const toOwner = await db.execute(`SELECT * FROM notifications WHERE user_id = 'uOwner' AND icon = 'ph-check-circle'`)
      expect(toOwner).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('respond to unknown invite → 404', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/invites/nope/respond', headers: asB, payload: { accept: true } })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })
})

describe('Collab facade — auto-rules + leave', () => {
  it('GET/DELETE auto-rules', async () => {
    await client.query(`INSERT INTO auto_rules (id,user_id,keyword,action,target_id,target_name,created_at) VALUES ('rule_1','uOwner','合同','invite','uBob','Bob','2026-07-15T09:00:00')`)
    const app = await buildWith('new')
    try {
      const list = await app.inject({ method: 'GET', url: '/api/auto-rules', headers: asO })
      expect(list.json().rules).toHaveLength(1)
      // 承 legacy 线上响应：不含内部 userId 字段
      expect(list.json().rules[0]).not.toHaveProperty('userId')
      expect(list.json().rules[0]).toMatchObject({ id: 'rule_1', keyword: '合同', targetId: 'uBob' })
      const del = await app.inject({ method: 'DELETE', url: '/api/auto-rules/rule_1', headers: asO })
      expect(del.json()).toEqual({ ok: true })
      expect((await app.inject({ method: 'GET', url: '/api/auto-rules', headers: asO })).json().rules).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  it('leave: accepted collaborator leaves → ok + owner sign-out notification (full ISO ts, no publish)', async () => {
    await makeFriends('uOwner', 'uBob')
    const app = await buildWith('new')
    try {
      const inv = await app.inject({ method: 'POST', url: '/api/tasks/t1/invite', headers: asO, payload: { userId: 'uBob' } })
      const id = inv.json().collab.id
      await app.inject({ method: 'POST', url: `/api/invites/${id}/respond`, headers: asB, payload: { accept: true } })
      events = []
      const res = await app.inject({ method: 'POST', url: '/api/tasks/t1/leave', headers: asB })
      expect(res.statusCode).toBe(200)
      const nt = await db.execute<{ text: string; created_at: string; icon: string }>(`SELECT * FROM notifications WHERE user_id = 'uOwner' AND icon = 'ph-sign-out'`)
      expect(nt).toHaveLength(1)
      expect(nt[0]!.text).toContain('Bob 退出了「写方案」的协作')
      expect(nt[0]!.created_at).toMatch(/T.*[Z.]/) // 全 ISO（含毫秒/Z），非分精度
      expect(events).toHaveLength(0) // leave 不 publish
    } finally {
      await app.close()
    }
  })

  it('leave a task you are not a collaborator of → 400', async () => {
    const app = await buildWith('new')
    try {
      // uBob 对 t1 无 accepted 协作行 → 但 uBob 也非 owner，且 access=null → 404 先命中
      const res = await app.inject({ method: 'POST', url: '/api/tasks/t1/leave', headers: asB })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })
})

describe('Collab facade — guards + fall-through', () => {
  it('unauthenticated → 401', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/invites' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
  it('registry collab=legacy → fall through', async () => {
    const app = await buildWith('legacy')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/invites', headers: asO })).json()).toEqual({ from: 'legacy-invites' })
    } finally {
      await app.close()
    }
  })
})
