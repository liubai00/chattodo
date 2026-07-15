import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import { PROJECTS_DDL } from '@linx/infra-projects-pg'
import { SETTINGS_DDL } from '@linx/infra-settings-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeSearchPlugin } from '../src/routes/search.routes.js'
import { makePlanPlugin } from '../src/routes/plan.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable
const FIXED_NOW = new Date('2026-07-15T09:00:00Z').getTime()

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/search', async () => ({ from: 'legacy-search' }))
  app.post('/api/plan', async () => ({ from: 'legacy-plan' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeSearchPlugin({ db }), makePlanPlugin({ db, now: () => FIXED_NOW })],
    registry: new RouteRegistry({ groups: { search: target, plan: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of [...TASKS_DDL, ...PROJECTS_DDL, ...SETTINGS_DDL]) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO app_settings (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  // tasks owned by uA
  await client.query(
    `INSERT INTO tasks (id,user_id,title,tags,status,due_at,priority,duration_minutes,privacy_scope,created_at,updated_at) VALUES
      ('t1','uA','写方案',      '["急"]','todo','2026-07-18T10:00:00',2,60,'work','2026-07-10T09:00:00','2026-07-10T09:00:00'),
      ('t2','uA','买菜',        '[]',    'todo','2026-07-20T10:00:00',3,30,'personal','2026-07-10T09:00:00','2026-07-10T09:00:00'),
      ('t3','uA','看方案论文',  '[]',    'todo',null,               1,30,'work','2026-07-10T09:00:00','2026-07-10T09:00:00')`,
  )
  await client.query(`INSERT INTO todo_ideas (id,user_id,title,raw_text,privacy_scope,created_at,updated_at) VALUES ('i1','uA','研究 Cubox','稍后读方案','work','2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO projects (id,user_id,name,created_at,updated_at) VALUES ('p1','uA','方案项目','2026-07-10T09:00:00','2026-07-10T09:00:00')`)
})
afterEach(async () => {
  await client.close()
})

describe('Search facade (registry search=new)', () => {
  it('GET /api/search matches tasks+ideas+projects', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/search?q=方案', headers: auth })
      expect(res.statusCode).toBe(200)
      const ids = res.json().results.map((r: { id: string }) => r.id)
      expect(ids).toEqual(expect.arrayContaining(['t1', 't3', 'i1', 'p1']))
      const types = res.json().results.map((r: { type: string }) => r.type)
      expect(types.indexOf('task')).toBeLessThan(types.indexOf('project')) // task→idea→project order
    } finally {
      await app.close()
    }
  })

  it('GET /api/mentions returns projects then tasks', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/mentions?q=', headers: auth })
      expect(res.json().results[0]).toMatchObject({ type: 'project', id: 'p1' })
    } finally {
      await app.close()
    }
  })
})

describe('Plan facade (registry plan=new)', () => {
  it('POST /api/plan orders by due↑/priority↑ from visible tasks', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/plan', headers: auth, payload: { blockMinutes: 120 } })
      expect(res.statusCode).toBe(200)
      // t1 (due 7/18) first, then t2 (due 7/20), then t3 (no due). total 60+30+30=120
      expect(res.json().plan.map((p: { task: { id: string } }) => p.task.id)).toEqual(['t1', 't2', 't3'])
      expect(res.json().totalMinutes).toBe(120)
    } finally {
      await app.close()
    }
  })

  it('POST /api/plan/commit sets sequential plannedAt + logs activity', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/plan/commit', headers: auth, payload: { items: [{ id: 't1', minutes: 60 }, { id: 't3', minutes: 30 }] } })
      expect(res.statusCode).toBe(200)
      expect(res.json().updated.map((u: { id: string }) => u.id)).toEqual(['t1', 't3'])
      const rows = await db.execute<{ id: string; planned_at: string }>(`SELECT id, planned_at FROM tasks WHERE id IN ('t1','t3') ORDER BY id`)
      expect(rows.find((r) => r.id === 't1')?.planned_at).toBe('2026-07-15T09:00:00.000Z')
      expect(rows.find((r) => r.id === 't3')?.planned_at).toBe('2026-07-15T10:00:00.000Z') // +60min
      const act = await db.execute(`SELECT * FROM activity WHERE text = '加入执行计划'`)
      expect(act).toHaveLength(2)
    } finally {
      await app.close()
    }
  })
})

describe('Query facade — guards + fall-through', () => {
  it('unauthenticated → 401', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/search?q=x' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
  it('registry=legacy → fall through', async () => {
    const app = await buildWith('legacy')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/search?q=x', headers: auth })).json()).toEqual({ from: 'legacy-search' })
      expect((await app.inject({ method: 'POST', url: '/api/plan', headers: auth })).json()).toEqual({ from: 'legacy-plan' })
    } finally {
      await app.close()
    }
  })
})
