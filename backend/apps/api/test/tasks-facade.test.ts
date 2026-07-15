import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeTasksPlugin } from '../src/routes/tasks.routes.js'

const alice: AuthUser = {
  id: 'uA',
  name: 'Alice',
  accountName: 'alice',
  email: 'a@x.com',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00',
}

let client: PGlite
let db: Queryable

// legacy 仍持有【写路由】（未迁移，携带 activity/通知副作用）+ list（用于 registry=legacy 验证）
async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/tasks', async () => [{ from: 'legacy-list' }])
  app.post('/api/tasks', async () => ({ from: 'legacy-create' }))
  app.patch('/api/tasks/:id', async () => ({ from: 'legacy-patch' }))
  app.post('/api/tasks/:id/done', async () => ({ from: 'legacy-done' }))
  app.delete('/api/tasks/:id', async () => ({ from: 'legacy-delete' }))
  app.setNotFoundHandler(async (_r, reply) =>
    reply.status(404).send({ error: 'legacy 404', code: 'NOT_FOUND' }),
  )
  await app.ready()
  return app
}

function tasksPlugin() {
  return makeTasksPlugin({
    db,
    getPrivacySettings: async () => ({ privacyMode: false, workspaceMode: 'work' }),
  })
}

async function buildWith(target: 'new' | 'legacy', legacy: FastifyInstance): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: legacy,
    migratedPlugins: [tasksPlugin()],
    registry: new RouteRegistry({ groups: { tasks: target } }),
    auth: { resolveSession: async (tok) => (tok === 'tok' ? alice : undefined) },
  })
}

const auth = { authorization: 'Bearer tok' }

async function seedTask(id: string, title: string): Promise<void> {
  await client.query(
    `INSERT INTO tasks (id,user_id,title,tags,status,privacy_scope,priority,created_at,updated_at)
     VALUES ($1,'uA',$2,'[]','todo','work',3,'2026-07-15T09:00:00','2026-07-15T09:00:00')`,
    [id, title],
  )
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const stmt of TASKS_DDL) await client.exec(stmt)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
})
afterEach(async () => {
  await client.close()
})

describe('Tasks BC — READ routes served from the NEW stack (registry tasks=new)', () => {
  it('GET /api/tasks lists from the new stack (PGlite)', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      await seedTask('task_1', '写周报')
      const res = await app.inject({ method: 'GET', url: '/api/tasks', headers: auth })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveLength(1)
      expect(body[0]).toMatchObject({ id: 'task_1', title: '写周报', status: 'todo', assignee: null })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('GET /api/tasks/:id returns { task, generationRecord } from the new stack', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      await seedTask('task_2', 'x')
      const res = await app.inject({ method: 'GET', url: '/api/tasks/task_2', headers: auth })
      expect(res.json()).toMatchObject({ task: { id: 'task_2' }, generationRecord: null })
      const miss = await app.inject({ method: 'GET', url: '/api/tasks/nope', headers: auth })
      expect(miss.statusCode).toBe(404)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('duplicate query params do not 500 (robust list parse)', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks?view=open&view=done', headers: auth })
      expect(res.statusCode).toBe(200)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('requires auth (no token → 401)', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      expect((await app.inject({ method: 'GET', url: '/api/tasks' })).statusCode).toBe(401)
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})

describe('Tasks BC — activity-only WRITE routes served from NEW stack', () => {
  it('POST /api/tasks creates on the new stack and logs activity', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: auth,
        payload: { title: '写周报' },
      })
      const task = created.json()
      expect(task).toMatchObject({ title: '写周报', status: 'todo' })
      // activity 已记（新栈）
      const act = await db.execute<{ text: string }>('SELECT text FROM activity WHERE task_id = $1', [task.id])
      expect(act.map((a) => a.text)).toContain('任务已创建')
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('POST /api/tasks without title → 400 (title trim check, faithful to legacy)', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      const res = await app.inject({ method: 'POST', url: '/api/tasks', headers: auth, payload: { title: '   ' } })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('title is required')
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('POST /:id/subtasks + move-out served from new stack', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      await seedTask('task_9', '任务')
      const sub = await app.inject({ method: 'POST', url: '/api/tasks/task_9/subtasks', headers: auth, payload: { text: '第一步' } })
      expect(sub.json()).toMatchObject({ text: '第一步', done: false })
      const moved = await app.inject({ method: 'POST', url: '/api/tasks/task_9/move-out', headers: auth })
      expect(moved.json().nonTodo).toMatchObject({ title: '任务', corrected: true })
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})

describe('Tasks BC — cross-user WRITE routes still fall through to legacy', () => {
  it('PATCH / done / DELETE stay legacy (notify side-effects preserved) even when tasks=new', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('new', legacy)
    try {
      await seedTask('task_1', 't')
      expect((await app.inject({ method: 'PATCH', url: '/api/tasks/task_1', headers: auth, payload: { status: 'done' } })).json()).toEqual({ from: 'legacy-patch' })
      expect((await app.inject({ method: 'POST', url: '/api/tasks/task_1/done', headers: auth })).json()).toEqual({ from: 'legacy-done' })
      expect((await app.inject({ method: 'DELETE', url: '/api/tasks/task_1', headers: auth })).json()).toEqual({ from: 'legacy-delete' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})

describe('registry tasks=legacy → even reads fall through to legacy', () => {
  it('GET /api/tasks serves the legacy handler when not toggled new', async () => {
    const legacy = await legacyStub()
    const app = await buildWith('legacy', legacy)
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks', headers: auth })
      expect(res.json()).toEqual([{ from: 'legacy-list' }])
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})
