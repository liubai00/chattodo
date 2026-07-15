import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import { PROJECTS_DDL } from '@linx/infra-projects-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeCapturePlugin } from '../src/routes/capture.routes.js'

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
  app.post('/api/capture', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'nf', code: 'NOT_FOUND' }))
  await app.ready()
  return app
}
async function build(target: 'new' | 'legacy', legacy: FastifyInstance): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: legacy,
    migratedPlugins: [makeCapturePlugin({ db })],
    registry: new RouteRegistry({ groups: { capture: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const stmt of [...TASKS_DDL, ...PROJECTS_DDL]) await client.exec(stmt)
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

describe('Capture BC — POST /api/capture (rule triage) on new stack', () => {
  it('captures an actionable input into a task', async () => {
    const legacy = await legacyStub()
    const app = await build('new', legacy)
    try {
      const res = await app.inject({ method: 'POST', url: '/api/capture', headers: auth, payload: { text: '明天提交周报评审' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().entityType).toBe('task')
      const [t] = await db.execute<{ c: number }>('SELECT count(*)::int AS c FROM tasks')
      expect(t?.c).toBe(1)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('400 on empty text; registry=legacy falls through', async () => {
    const legacy = await legacyStub()
    const app = await build('new', legacy)
    try {
      expect((await app.inject({ method: 'POST', url: '/api/capture', headers: auth, payload: { text: '  ' } })).statusCode).toBe(400)
    } finally {
      await app.close()
      await legacy.close()
    }
    const legacy2 = await legacyStub()
    const app2 = await build('legacy', legacy2)
    try {
      expect((await app2.inject({ method: 'POST', url: '/api/capture', headers: auth, payload: { text: 'x' } })).json()).toEqual({ from: 'legacy' })
    } finally {
      await app2.close()
      await legacy2.close()
    }
  })
})
