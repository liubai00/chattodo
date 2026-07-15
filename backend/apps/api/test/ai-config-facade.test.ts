import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { AI_CONFIG_DDL, type Queryable } from '@linx/infra-ai-config-pg'
import type { LlmClient } from '@linx/platform-llm'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeAiConfigPlugin, baseUrlError } from '../src/routes/ai.routes.js'

const admin: AuthUser = { id: 'uAdmin', name: 'Admin', accountName: 'admin', email: 'admin@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }
const member: AuthUser = { ...admin, id: 'uMem', name: 'Mem', accountName: 'mem', email: 'm@x.io', role: 'member' }

let client: PGlite
let db: Queryable

// 假 LlmClient：/api/ai/test 用，不触网
const fakeLlm: LlmClient = {
  async messagesJson() {
    return { kind: 'task', title: '交MVP评审' }
  },
  async messagesText() {
    return '{}'
  },
  async streamText() {
    return ''
  },
  async complete() {
    return ''
  },
}

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/ai/config', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [makeAiConfigPlugin({ db, llm: fakeLlm, clock: () => new Date('2026-07-15T10:00:00') })],
    registry: new RouteRegistry({ groups: { ai: target } }),
    auth: { resolveSession: async (t) => (t === 'adm' ? admin : t === 'mem' ? member : undefined) },
  })
}
const asAdmin = { authorization: 'Bearer adm' }
const asMember = { authorization: 'Bearer mem' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of AI_CONFIG_DDL) await client.exec(s)
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

describe('baseUrlError (SSRF guard, unit)', () => {
  it('blocks localhost/private IPs, allows public https, empty ok', () => {
    expect(baseUrlError('')).toBeNull()
    expect(baseUrlError('https://api.deepseek.com/v1')).toBeNull()
    expect(baseUrlError('http://localhost:8080')).toMatch(/内网/)
    expect(baseUrlError('http://127.0.0.1')).toMatch(/内网/)
    expect(baseUrlError('http://192.168.1.5')).toMatch(/内网/)
    expect(baseUrlError('http://10.0.0.1')).toMatch(/内网/)
    expect(baseUrlError('ftp://x.com')).toMatch(/http/)
    expect(baseUrlError('not a url')).toMatch(/格式/)
  })
})

describe('AI config facade', () => {
  it('GET returns masked config (no apiKey), source team by default', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'GET', url: '/api/ai/config', headers: asMember })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toMatchObject({ provider: 'rule', hasKey: false, source: 'team' })
      expect(body).not.toHaveProperty('apiKey')
      expect(body.team).toMatchObject({ provider: 'rule' })
    } finally {
      await app.close()
    }
  })

  it('PUT team config: admin only (member 403), masks key', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'PUT', url: '/api/ai/config', headers: asMember, payload: { provider: 'anthropic' } })).statusCode).toBe(403)
      const res = await app.inject({ method: 'PUT', url: '/api/ai/config', headers: asAdmin, payload: { provider: 'anthropic', model: 'claude', apiKey: 'sk-secret' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ provider: 'anthropic', model: 'claude', hasKey: true })
      expect(res.json()).not.toHaveProperty('apiKey')
    } finally {
      await app.close()
    }
  })

  it('SSRF guard rejects internal Base URL on PUT', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'PUT', url: '/api/ai/config', headers: asAdmin, payload: { baseUrl: 'http://localhost:1234' } })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/内网/)
    } finally {
      await app.close()
    }
  })

  it('personal override + clear: own beats team, source flips', async () => {
    const app = await buildWith('new')
    try {
      await app.inject({ method: 'PUT', url: '/api/ai/config', headers: asAdmin, payload: { provider: 'anthropic', model: 'team-model', apiKey: 'team-key' } })
      await app.inject({ method: 'PUT', url: '/api/ai/config/own', headers: asMember, payload: { model: 'my-model', apiKey: 'my-key' } })
      let cfg = (await app.inject({ method: 'GET', url: '/api/ai/config', headers: asMember })).json()
      expect(cfg).toMatchObject({ source: 'own', model: 'my-model' })
      await app.inject({ method: 'DELETE', url: '/api/ai/config/own', headers: asMember })
      cfg = (await app.inject({ method: 'GET', url: '/api/ai/config', headers: asMember })).json()
      expect(cfg).toMatchObject({ source: 'team', model: 'team-model' })
    } finally {
      await app.close()
    }
  })

  it('POST /api/ai/test runs triage against a (draft) config', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/ai/test', headers: asAdmin, payload: { provider: 'anthropic', model: 'claude', apiKey: 'k', sample: '下周三前提交 MVP 文档评审' } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ ok: true, provider: 'anthropic', kind: 'task', title: '交MVP评审' })
    } finally {
      await app.close()
    }
  })

  it('unauthenticated → 401; registry ai=legacy → fall through', async () => {
    const appNew = await buildWith('new')
    try {
      expect((await appNew.inject({ method: 'GET', url: '/api/ai/config' })).statusCode).toBe(401)
    } finally {
      await appNew.close()
    }
    const appLegacy = await buildWith('legacy')
    try {
      expect((await appLegacy.inject({ method: 'GET', url: '/api/ai/config', headers: asAdmin })).json()).toEqual({ from: 'legacy' })
    } finally {
      await appLegacy.close()
    }
  })
})
