import { describe, it, expect } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { buildApi, type MigratedPlugin } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'

async function stubLegacy(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/tasks', async () => ({ from: 'legacy', route: 'tasks' }))
  app.get('/api/legacy-only', async () => ({ from: 'legacy' }))
  app.post('/api/echo', async (req) => ({ from: 'legacy', body: req.body }))
  app.setNotFoundHandler(async (_r, reply) =>
    reply.status(404).send({ error: 'legacy 404', code: 'NOT_FOUND' }),
  )
  await app.ready()
  return app
}

const tasksNew: MigratedPlugin = {
  group: 'tasks',
  register: async (app) => {
    app.get('/api/tasks', async () => ({ from: 'new', route: 'tasks' }))
  },
}

describe('Facade routing', () => {
  it('serves a migrated route from NEW when its group is toggled new', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({
      legacyApp: legacy,
      migratedPlugins: [tasksNew],
      registry: new RouteRegistry({ groups: { tasks: 'new' } }),
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' })
      expect(res.json()).toEqual({ from: 'new', route: 'tasks' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('falls through to LEGACY when the group is legacy (new plugin not registered)', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({
      legacyApp: legacy,
      migratedPlugins: [tasksNew],
      registry: new RouteRegistry({ default: 'legacy' }),
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' })
      expect(res.json()).toEqual({ from: 'legacy', route: 'tasks' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('forwards unmatched routes to legacy, including POST bodies', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({ legacyApp: legacy })
    try {
      const g = await app.inject({ method: 'GET', url: '/api/legacy-only' })
      expect(g.json()).toEqual({ from: 'legacy' })
      const p = await app.inject({ method: 'POST', url: '/api/echo', payload: { a: 1 } })
      expect(p.json()).toEqual({ from: 'legacy', body: { a: 1 } })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('reqId + metrics span legacy-served routes; own probes stay live', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({ legacyApp: legacy })
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/legacy-only',
        headers: { 'x-request-id': 'rid-1' },
      })
      expect(res.headers['x-request-id']).toBe('rid-1')

      const metrics = await app.inject({ method: 'GET', url: '/metrics' })
      expect(metrics.body).toContain('http_requests_total')

      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
      expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('fails fast (501) on SSE fall-through instead of hanging', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({ legacyApp: legacy })
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/events',
        headers: { accept: 'text/event-stream' },
      })
      expect(res.statusCode).toBe(501)
      expect(res.json().code).toBe('NOT_IMPLEMENTED')
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('forwards non-JSON bodies to legacy (not 415 at the facade)', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({ legacyApp: legacy })
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/echo',
        headers: { 'content-type': 'text/plain' },
        payload: 'raw-bytes',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ from: 'legacy', body: 'raw-bytes' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('legacy 404 propagates when neither new nor legacy has the route', async () => {
    const legacy = await stubLegacy()
    const app = await buildApi({ legacyApp: legacy })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/nope' })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('NOT_FOUND')
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})
