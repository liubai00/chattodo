import { describe, it, expect } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'

const alice: AuthUser = {
  id: 'u1',
  name: 'Alice',
  accountName: 'alice',
  email: 'a@x.com',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00',
}

async function legacyApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/tasks', async () => ({ ok: true, from: 'legacy' }))
  app.get('/api/authx', async () => ({ ok: true, from: 'legacy-authx' })) // 名字以 /api/auth 开头但非开放
  app.setNotFoundHandler(async (_r, reply) =>
    reply.status(404).send({ error: 'legacy 404', code: 'NOT_FOUND' }),
  )
  await app.ready()
  return app
}

function resolver(sessions: Record<string, AuthUser>) {
  return async (token: string | undefined): Promise<AuthUser | undefined> =>
    token ? sessions[token] : undefined
}

describe('auth preHandler (guards unmigrated /api routes too)', () => {
  it('401 on a protected /api route without a valid token', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({}) } })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('UNAUTHENTICATED')
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('passes through to legacy with a valid token', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({ tok: alice }) } })
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks',
        headers: { authorization: 'Bearer tok' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true, from: 'legacy' })
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('open paths (/api/auth) reach the handler without a token (not 401)', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({}) } })
    try {
      // legacy has no /api/auth/login → legacy 404, but crucially NOT 401 (auth let it through)
      const res = await app.inject({ method: 'POST', url: '/api/auth/login' })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('non-/api probes are never guarded', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({}) } })
    try {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
      expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(200)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('does NOT allow percent-encoding the /api prefix to bypass the guard', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({}) } })
    try {
      // %61='a' → 原始 /%61pi/tasks 看似非 /api，但路由解码后命中 /api/tasks（受保护）
      for (const url of ['/%61pi/tasks', '/ap%69/tasks', '/api/tasks']) {
        const res = await app.inject({ method: 'GET', url })
        expect(res.statusCode, url).toBe(401)
      }
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('open-path check has a segment boundary (/api/authx is NOT public)', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({}) } })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/authx' })
      expect(res.statusCode).toBe(401) // 不因前缀 /api/auth 被误判为开放
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('malformed percent-encoding fails closed (never 200)', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({ legacyApp: legacy, auth: { resolveSession: resolver({}) } })
    try {
      // 畸形编码由 find-my-way 先行 400，或落到本插件 fail-closed → 总之绝不 200 泄露。
      const res = await app.inject({ method: 'GET', url: '/api/%zztasks' })
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await app.close()
      await legacy.close()
    }
  })

  it('requireAuth:false disables the 401 guard', async () => {
    const legacy = await legacyApp()
    const app = await buildApi({
      legacyApp: legacy,
      auth: { resolveSession: resolver({}), requireAuth: false },
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' })
      expect(res.statusCode).toBe(200) // 无 token 也放行 → legacy 处理
    } finally {
      await app.close()
      await legacy.close()
    }
  })
})
