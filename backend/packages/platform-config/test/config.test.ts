import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/index.js'

describe('loadConfig', () => {
  it('applies defaults on empty env', () => {
    const c = loadConfig({})
    expect(c.port).toBe(8787)
    expect(c.host).toBe('127.0.0.1')
    expect(c.ai.provider).toBe('rule')
    expect(c.ai.fallbackToRule).toBe(true)
    expect(c.databaseUrl).toBe('')
  })

  it('coerces and parses provided values', () => {
    const c = loadConfig({
      PORT: '9000',
      AI_PROVIDER: 'openai',
      AI_BASE_URL: 'https://api.example.com/v1',
      AI_FALLBACK_TO_RULE: 'false',
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(c.port).toBe(9000)
    expect(c.ai.provider).toBe('openai')
    expect(c.ai.baseUrl).toBe('https://api.example.com/v1')
    expect(c.ai.fallbackToRule).toBe(false)
    expect(c.redisUrl).toBe('redis://localhost:6379')
  })

  it('rejects non-http AI_BASE_URL (SSRF form check)', () => {
    expect(() => loadConfig({ AI_BASE_URL: 'ftp://evil' })).toThrow()
  })

  it('rejects unknown AI_PROVIDER', () => {
    expect(() => loadConfig({ AI_PROVIDER: 'foo' })).toThrow()
  })

  it('rejects non-redis REDIS_URL', () => {
    expect(() => loadConfig({ REDIS_URL: 'http://localhost' })).toThrow()
  })
})
