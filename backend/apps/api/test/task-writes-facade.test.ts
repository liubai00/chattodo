import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import { SOCIAL_DDL } from '@linx/infra-social-pg'
import { COLLAB_DDL } from '@linx/infra-collab-pg'
import { NOTIFICATIONS_DDL } from '@linx/infra-notifications-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeTaskWritesPlugin } from '../src/routes/task-writes.routes.js'
import type { TaskRepoFactory } from '../src/composition/task-repo-factory.js'

const owner: AuthUser = { id: 'uOwner', name: 'Owner', accountName: 'owner', email: 'o@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }
const bob: AuthUser = { ...owner, id: 'uBob', name: 'Bob', accountName: 'bob', email: 'b@x.io' }

let client: PGlite
let db: Queryable
let events: Array<{ userId: string; payload: unknown }>
let idc = 0

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}
async function build(): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeTaskWritesPlugin({ db, publish: (userId, payload) => events.push({ userId, payload }), publishMany: (ids, payload) => ids.forEach((userId) => events.push({ userId, payload })), clock: () => new Date('2026-07-15T09:00:00'), genId: (p) => `${p}_t${++idc}` })],
    registry: new RouteRegistry({ groups: { tasks: 'new' } }),
    auth: { resolveSession: async (t) => (t === 'tokO' ? owner : t === 'tokB' ? bob : undefined) },
  })
}

async function buildBaserow(onRemove: (id: string) => void): Promise<FastifyInstance> {
  const task = {
    id: 'brw:personal:11:21',
    title: 'Baserow 任务',
    notes: '',
    status: 'todo' as const,
    projectId: null,
    tags: [],
    context: '',
    dueAt: null,
    plannedAt: null,
    durationMinutes: null,
    priority: 3 as const,
    privacyScope: 'personal' as const,
    sourceIdeaId: null,
    assignee: null,
    createdAt: '2026-07-15T09:00:00',
    updatedAt: '2026-07-15T09:00:00',
  }
  const taskRepos: TaskRepoFactory = {
    backend: 'baserow',
    forRequest: () => ({
      all: async () => [task],
      get: async (id) => (id === task.id ? task : undefined),
      access: async (id) => (id === task.id ? 'owner' : null),
      create: async () => task,
      update: async (id) => (id === task.id ? task : undefined),
      remove: async (id) => { onRemove(id) },
    }),
  }
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeTaskWritesPlugin({ db, taskRepos, publish: () => {}, publishMany: () => {} })],
    registry: new RouteRegistry({ groups: { tasks: 'new' } }),
    auth: { resolveSession: async (token) => (token === 'tokO' ? owner : undefined) },
  })
}
const asO = { authorization: 'Bearer tokO' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of [...TASKS_DDL, ...SOCIAL_DDL, ...COLLAB_DDL, ...NOTIFICATIONS_DDL]) await client.exec(s)
  await client.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, created_at TEXT)`)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO users (id,name,email,role,created_at) VALUES ('uOwner','Owner','o@x.io','admin','2026-01-01T00:00:00'),('uBob','Bob','b@x.io','member','2026-01-02T00:00:00')`)
  await client.query(`INSERT INTO tasks (id,user_id,title,tags,status,privacy_scope,priority,created_at,updated_at) VALUES ('t1','uOwner','写方案','[]','todo','work',3,'2026-07-15T09:00:00','2026-07-15T09:00:00')`)
  // Owner 与 Bob 是好友（指派/评论@ 通知需好友收口）
  await client.query(`INSERT INTO friendships (id,requester_id,addressee_id,status,created_at,responded_at) VALUES ('fr1','uOwner','uBob','accepted','2026-07-01T09:00:00','2026-07-01T09:05:00')`)
  events = []
  idc = 0
})
afterEach(async () => {
  await client.close()
})

describe('Task-writes facade (group tasks)', () => {
  it('GET :id/detail returns task + access + collaborators/subtasks/comments/activity', async () => {
    const app = await build()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks/t1/detail', headers: asO })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ task: { id: 't1' }, access: 'owner', collaborators: [], subtasks: [], comments: [], activity: [] })
    } finally {
      await app.close()
    }
  })

  it('PATCH status=done logs activity + notifies watchers; assignee notifies a friend', async () => {
    const app = await build()
    try {
      // 先让 Bob 成为已接受协作者（这样 done 会通知他）
      await client.query(`INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at) VALUES ('c1','t1','uOwner','uBob','uOwner','accepted',1,'2026-07-15T09:00:00')`)
      const res = await app.inject({ method: 'PATCH', url: '/api/tasks/t1', headers: asO, payload: { status: 'done', assignee: 'Bob' } })
      expect(res.statusCode).toBe(200)
      // notifyTaskDone → Bob 收到 done 通知
      const done = await db.execute(`SELECT * FROM notifications WHERE user_id = 'uBob' AND type = 'done'`)
      expect(done).toHaveLength(1)
      // assignee → Bob 收到指派通知（好友收口通过）
      const assign = await db.execute(`SELECT * FROM notifications WHERE user_id = 'uBob' AND text LIKE '%指派给你%'`)
      expect(assign).toHaveLength(1)
      const act = await db.execute(`SELECT * FROM activity WHERE task_id = 't1'`)
      expect(act.length).toBeGreaterThanOrEqual(2) // 状态改 + 指派
    } finally {
      await app.close()
    }
  })

  it('POST :id/done marks done + notifies watchers once', async () => {
    const app = await build()
    try {
      await client.query(`INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at) VALUES ('c1','t1','uOwner','uBob','uOwner','accepted',1,'2026-07-15T09:00:00')`)
      const res = await app.inject({ method: 'POST', url: '/api/tasks/t1/done', headers: asO })
      expect(res.json()).toMatchObject({ status: 'done' })
      expect(await db.execute(`SELECT * FROM notifications WHERE user_id = 'uBob' AND type = 'done'`)).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('DELETE owner-only: non-owner 403; owner deletes + notifies collaborators + cleans up', async () => {
    const app = await build()
    try {
      await client.query(`INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at) VALUES ('c1','t1','uOwner','uBob','uOwner','accepted',1,'2026-07-15T09:00:00')`)
      // Bob（协作者，非 owner）删除 → 403
      expect((await app.inject({ method: 'DELETE', url: '/api/tasks/t1', headers: { authorization: 'Bearer tokB' } })).statusCode).toBe(403)
      // Owner 删除 → ok + Bob 收到删除通知 + 协作关系清空
      const res = await app.inject({ method: 'DELETE', url: '/api/tasks/t1', headers: asO })
      expect(res.json()).toEqual({ ok: true })
      expect(await db.execute(`SELECT * FROM tasks WHERE id = 't1'`)).toHaveLength(0)
      expect(await db.execute(`SELECT * FROM task_collaborators WHERE task_id = 't1'`)).toHaveLength(0)
      expect((await db.execute(`SELECT * FROM notifications WHERE user_id = 'uBob' AND icon = 'ph-trash'`))).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('requires an explicit confirmation marker before deleting a Baserow row', async () => {
    const removed: string[] = []
    const app = await buildBaserow((id) => removed.push(id))
    try {
      const url = '/api/tasks/brw:personal:11:21'
      const denied = await app.inject({ method: 'DELETE', url, headers: asO })
      expect(denied.statusCode).toBe(409)
      expect(denied.json()).toMatchObject({ code: 'CONFIRMATION_REQUIRED', action: 'row.delete' })
      expect(removed).toEqual([])

      const confirmed = await app.inject({
        method: 'DELETE',
        url,
        headers: asO,
        payload: { confirmation: 'confirmed-by-linx' },
      })
      expect(confirmed.statusCode).toBe(200)
      expect(confirmed.json()).toEqual({ ok: true })
      expect(removed).toEqual(['brw:personal:11:21'])
    } finally {
      await app.close()
    }
  })

  it('POST :id/comments adds comment + activity + @mention notifies a friend', async () => {
    const app = await build()
    try {
      const res = await app.inject({ method: 'POST', url: '/api/tasks/t1/comments', headers: asO, payload: { text: '这个 @Bob 帮忙看下' } })
      expect(res.statusCode).toBe(200)
      const cmts = await db.execute(`SELECT * FROM comments WHERE task_id = 't1'`)
      expect(cmts).toHaveLength(1)
      // @Bob（好友）→ 收到评论提及通知
      expect((await db.execute(`SELECT * FROM notifications WHERE user_id = 'uBob' AND icon = 'ph-chat-circle'`))).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('empty comment → 400; unknown task → 404; unauthenticated → 401', async () => {
    const app = await build()
    try {
      expect((await app.inject({ method: 'POST', url: '/api/tasks/t1/comments', headers: asO, payload: { text: '  ' } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'GET', url: '/api/tasks/nope/detail', headers: asO })).statusCode).toBe(404)
      expect((await app.inject({ method: 'PATCH', url: '/api/tasks/t1', payload: { status: 'done' } })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
})
