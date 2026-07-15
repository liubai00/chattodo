import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { SETTINGS_DDL, type Queryable } from '@linx/infra-settings-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeSettingsPlugin } from '../src/routes/settings.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/settings', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeSettingsPlugin({ db, clock: () => new Date('2026-07-15T10:00:00') })],
    registry: new RouteRegistry({ groups: { settings: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of SETTINGS_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO app_settings (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO agent_profile (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
})
afterEach(async () => {
  await client.close()
})

describe('Settings facade (registry settings=new)', () => {
  it('GET /api/settings returns defaults', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/settings', headers: auth })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ workspaceMode: 'work', privacyMode: false, friendPolicy: 'open' })
    } finally {
      await app.close()
    }
  })

  it('PUT /api/settings merges + persists', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'PUT', url: '/api/settings', headers: auth, payload: { privacyMode: true, workspaceMode: 'personal' } })
      expect(res.json()).toMatchObject({ privacyMode: true, workspaceMode: 'personal', updatedAt: '2026-07-15T10:00:00' })
      const again = await app.inject({ method: 'GET', url: '/api/settings', headers: auth })
      expect(again.json()).toMatchObject({ privacyMode: true, workspaceMode: 'personal' })
    } finally {
      await app.close()
    }
  })

  it('GET/PUT /api/agent', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/agent', headers: auth })).json()).toMatchObject({ soul: '', memory: '' })
      const res = await app.inject({ method: 'PUT', url: '/api/agent', headers: auth, payload: { soul: '可靠' } })
      expect(res.json()).toMatchObject({ soul: '可靠', updatedAt: '2026-07-15T10:00:00' })
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/settings' })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('registry settings=legacy → fall through', async () => {
    const app = await buildWith('legacy')
    try {
      expect((await app.inject({ method: 'GET', url: '/api/settings', headers: auth })).json()).toEqual({ from: 'legacy' })
    } finally {
      await app.close()
    }
  })
})
