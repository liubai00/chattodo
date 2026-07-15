import { describe, it, expect } from 'vitest'
import { buildLegacyApp } from '../src/index.js'

describe('buildLegacyApp (shell)', () => {
  it('serves its placeholder route and 404s the rest', async () => {
    const app = await buildLegacyApp()
    try {
      const ping = await app.inject({ method: 'GET', url: '/api/legacy/ping' })
      expect(ping.statusCode).toBe(200)
      expect(ping.json()).toEqual({ ok: true, from: 'legacy-shell' })

      const missing = await app.inject({ method: 'GET', url: '/api/unknown' })
      expect(missing.statusCode).toBe(404)
      expect(missing.json().code).toBe('NOT_FOUND')
    } finally {
      await app.close()
    }
  })
})
