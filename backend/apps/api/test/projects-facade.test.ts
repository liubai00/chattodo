import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { PROJECTS_DDL, type Queryable } from '@linx/infra-projects-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeProjectsPlugin } from '../src/routes/projects.routes.js'

const alice: AuthUser = {
  id: 'uA',
  name: 'Alice',
  accountName: 'alice',
  email: 'a@x.com',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00',
}
const auth = { authorization: 'Bearer tok' }
let client: PGlite
let db: Queryable

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.post('/api/projects', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'nf', code: 'NOT_FOUND' }))
  await app.ready()
  return app
}

async function build(target: 'new' | 'legacy', legacy: FastifyInstance): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: legacy,
    migratedPlugins: [makeProjectsPlugin({ db })],
    registry: new RouteRegistry({ groups: { projects: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const stmt of PROJECTS_DDL) await client.exec(stmt)
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

describe('Projects BC — POST /api/projects on new stack', () => {
  it('creates a project (defaults) on the new stack', async () => {
    const legacy = await legacyStub()
    const app = await build('new', legacy)
    try {
      const res = await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'MVP 文档', description: '  核心闭环  ' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ name: 'MVP 文档', description: '核心闭环', status: 'active', privacyScope: 'work' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('validates name (400 empty / 400 too long / 409 duplicate)', async () => {
    const legacy = await legacyStub()
    const app = await build('new', legacy)
    try {
      expect((await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: '  ' } })).json().error).toBe('请输入项目名称')
      expect((await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'x'.repeat(25) } })).json().error).toBe('项目名称最长 24 字')
      await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Dup' } })
      const dup = await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'Dup' } })
      expect(dup.statusCode).toBe(409)
      expect(dup.json().error).toBe('同名项目已存在')
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('registry projects=legacy → falls through', async () => {
    const legacy = await legacyStub()
    const app = await build('legacy', legacy)
    try {
      const res = await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: 'x' } })
      expect(res.json()).toEqual({ from: 'legacy' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})
