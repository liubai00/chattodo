import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeAdminPlugin } from '../src/routes/admin.routes.js'

const admin: AuthUser = { id: 'uAdmin', name: 'Admin', accountName: 'admin', email: 'admin@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }
const member: AuthUser = { ...admin, id: 'uMember', name: 'Member', accountName: 'member', email: 'm@x.io', role: 'member' }

let client: PGlite
let db: Queryable

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/admin/overview', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeAdminPlugin({ db })],
    registry: new RouteRegistry({ groups: { admin: target } }),
    auth: { resolveSession: async (t) => (t === 'adm' ? admin : t === 'mem' ? member : undefined) },
  })
}
const asAdmin = { authorization: 'Bearer adm' }
const asMember = { authorization: 'Bearer mem' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of TASKS_DDL) await client.exec(s)
  await client.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, account_name TEXT, email TEXT, role TEXT, created_at TEXT)`)
  await client.exec(`CREATE TABLE ai_errors (id TEXT PRIMARY KEY, user_id TEXT, raw_input TEXT, message TEXT, created_at TEXT)`)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO users (id,name,account_name,email,role,created_at) VALUES
    ('uAdmin','Admin','admin','admin@x.io','admin','2026-01-01T00:00:00'),
    ('uBob','Bob','bob','b@x.io','member','2026-01-02T00:00:00')`)
  await client.query(`INSERT INTO tasks (id,user_id,title,tags,status,priority,privacy_scope,created_at,updated_at) VALUES
    ('t1','uBob','写方案','[]','todo',3,'work','2026-07-10T09:00:00','2026-07-10T09:00:00'),
    ('t2','uBob','买菜','[]','todo',3,'work','2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO todo_ideas (id,user_id,title,raw_text,status,privacy_scope,created_at,updated_at) VALUES ('i1','uBob','研究','原文','clarifying','work','2026-07-10T09:00:00','2026-07-10T09:00:00')`)
  await client.query(`INSERT INTO ai_errors (id,user_id,raw_input,message,created_at) VALUES ('e1','uBob','坏输入','triage failed','2026-07-11T09:00:00')`)
  await client.query(`INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,ai_reason,result_entity_type,result_entity_id,status,created_at) VALUES ('cr1','uBob','写方案','chat','task','规则命中','task','t1','done','2026-07-10T09:00:00')`)
})
afterEach(async () => {
  await client.close()
})

describe('Admin facade (registry admin=new)', () => {
  it('member → 403 on both routes', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/admin/overview', headers: asMember })).statusCode).toBe(403)
      expect((await app.inject({ method: 'GET', url: '/api/admin/users/uBob', headers: asMember })).statusCode).toBe(403)
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401 (facade-wide auth guard fires before requireAdmin)', async () => {
    const app = await buildWith('new')
    try {
      // 现网 admin 对未登录返回 403；Facade 统一鉴权对未登录 /api 先行 401（与其它已迁移组一致）。
      expect((await app.inject({ method: 'GET', url: '/api/admin/overview' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('overview: per-user counts + totalErrors', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: asAdmin })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.totalErrors).toBe(1)
      const bob = body.users.find((u: { id: string }) => u.id === 'uBob')
      expect(bob).toMatchObject({ taskCount: 2, ideaCount: 1, errorCount: 1, nonCount: 0, accountName: 'bob' })
    } finally {
      await app.close()
    }
  })

  it('user detail: capture records with resultTitle + ai errors', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/admin/users/uBob', headers: asAdmin })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.user).toMatchObject({ id: 'uBob', accountName: 'bob' })
      expect(body.records[0]).toMatchObject({ rawInput: '写方案', resultEntityId: 't1', resultTitle: '写方案' })
      expect(body.errors[0]).toMatchObject({ message: 'triage failed' })
    } finally {
      await app.close()
    }
  })

  it('user detail: unknown user → 404; deleted entity → （已删除）', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/admin/users/ghost', headers: asAdmin })).statusCode).toBe(404)
      // 删除 t1 → resultTitle 回退
      await client.query(`DELETE FROM tasks WHERE id = 't1'`)
      const res = await app.inject({ method: 'GET', url: '/api/admin/users/uBob', headers: asAdmin })
      expect(res.json().records[0].resultTitle).toBe('（已删除）')
    } finally {
      await app.close()
    }
  })

  it('registry admin=legacy → fall through (admin)', async () => {
    const app = await buildWith('legacy')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/admin/overview', headers: asAdmin })).json()).toEqual({ from: 'legacy' })
    } finally {
      await app.close()
    }
  })
})
