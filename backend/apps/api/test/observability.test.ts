import { describe, it, expect } from 'vitest'
import { buildServer } from '../src/server.js'

describe('observability endpoints', () => {
  it('GET /ready aggregates readiness (empty registry → ok)', async () => {
    const app = await buildServer()
    try {
      const res = await app.inject({ method: 'GET', url: '/ready' })
      expect(res.statusCode).toBe(200)
      expect(res.json().ready).toBe(true)
    } finally {
      await app.close()
    }
  })

  it('GET /metrics exposes prometheus text', async () => {
    const app = await buildServer()
    try {
      // 先打一次业务请求，产生 http_requests_total 样本
      await app.inject({ method: 'GET', url: '/health' })
      const res = await app.inject({ method: 'GET', url: '/metrics' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/plain')
      expect(res.body).toContain('http_requests_total')
    } finally {
      await app.close()
    }
  })

  it('echoes x-request-id header', async () => {
    const app = await buildServer()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-request-id': 'test-req-42' },
      })
      expect(res.headers['x-request-id']).toBe('test-req-42')
    } finally {
      await app.close()
    }
  })
})
