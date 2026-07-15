import { describe, it, expect } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { createEventBus } from '@linx/platform-eventbus'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeEventsPlugin } from '../src/routes/events.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/events', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

describe('Events facade — realtime SSE subscribe on the shared bus', () => {
  it('unauthenticated → 401 (before hijack)', async () => {
    const bus = await createEventBus()
    const app = await buildApi({
      legacyApp: await legacyStub(),
      migratedPlugins: [makeEventsPlugin({ bus })],
      registry: new RouteRegistry({ groups: { events: 'new' } }),
      auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
    })
    try {
      expect((await app.inject({ method: 'GET', url: '/api/events' })).statusCode).toBe(401)
    } finally {
      await app.close()
      await bus.close()
    }
  })

  it('registry events=legacy → fall through', async () => {
    const bus = await createEventBus()
    const app = await buildApi({
      legacyApp: await legacyStub(),
      migratedPlugins: [makeEventsPlugin({ bus })],
      registry: new RouteRegistry({ groups: { events: 'legacy' } }),
      auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
    })
    try {
      expect((await app.inject({ method: 'GET', url: '/api/events', headers: { authorization: 'Bearer tok' } })).json()).toEqual({ from: 'legacy' })
    } finally {
      await app.close()
      await bus.close()
    }
  })

  it('shared-bus round-trip: a plugin publish reaches an /api/events subscriber (frame byte-exact)', async () => {
    // 复刻 main.ts 的关键闭环：插件用的 publish 与 events 路由的 subscribe 是同一个 bus。
    const bus = await createEventBus()
    try {
      const frames: string[] = []
      // events 路由内部即 bus.subscribe(userId, reply.raw)；这里用同构的假 sink 验证回环。
      const unsub = bus.subscribe('uA', { write: (c: string) => frames.push(c) })
      // 某插件（如 collab.pushNotification）的 publish(userId, {kind:'notify',...})
      bus.publish('uA', { kind: 'notify', text: 'B 邀请你协作「写方案」', actionType: 'invite' })
      bus.publish('uA', { kind: 'friends' })
      bus.publishMany(['uA', 'uB'], { kind: 'task', taskId: 't1' })
      unsub()
      bus.publish('uA', { kind: 'notify', text: 'after unsub' }) // 取消后不再收到
      expect(frames[0]).toBe('event: notify\ndata: {"kind":"notify","text":"B 邀请你协作「写方案」","actionType":"invite"}\n\n')
      expect(frames[1]).toBe('event: friends\ndata: {"kind":"friends"}\n\n')
      expect(frames[2]).toBe('event: task\ndata: {"kind":"task","taskId":"t1"}\n\n')
      expect(frames).toHaveLength(3) // 取消订阅后的 publish 不投递
    } finally {
      await bus.close()
    }
  })
})
