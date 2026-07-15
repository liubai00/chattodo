import { describe, it, expect } from 'vitest'
import { buildServer } from '../src/server.js'

describe('GET /health', () => {
  it('returns a valid health envelope', async () => {
    const app = await buildServer()
    try {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.ok).toBe(true)
      expect(body.service).toBe('linx-api')
      expect(typeof body.version).toBe('string')
      expect(body.uptimeMs).toBeGreaterThanOrEqual(0)
      expect(typeof body.time).toBe('string')
    } finally {
      await app.close()
    }
  })
})
