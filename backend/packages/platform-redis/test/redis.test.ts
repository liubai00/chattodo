import { describe, it, expect } from 'vitest'
import { namespacedKey, buildRedisOptions, pingRedis } from '../src/index.js'

describe('namespacedKey', () => {
  it('joins root + namespace + parts with colons', () => {
    expect(namespacedKey('cache', 'user', '42')).toBe('linx:cache:user:42')
    expect(namespacedKey('ratelimit', 'auth:login', '1.2.3.4')).toBe(
      'linx:ratelimit:auth:login:1.2.3.4',
    )
    expect(namespacedKey('events')).toBe('linx:events')
  })
})

describe('buildRedisOptions', () => {
  it('defaults to lazy connect + null maxRetriesPerRequest (BullMQ-safe)', () => {
    const o = buildRedisOptions()
    expect(o.lazyConnect).toBe(true)
    expect(o.maxRetriesPerRequest).toBeNull()
    expect(o.enableReadyCheck).toBe(true)
    expect('keyPrefix' in o).toBe(false)
  })

  it('honors overrides and keyPrefix', () => {
    const o = buildRedisOptions({ lazyConnect: false, maxRetriesPerRequest: 3, keyPrefix: 'x:' })
    expect(o.lazyConnect).toBe(false)
    expect(o.maxRetriesPerRequest).toBe(3)
    expect(o.keyPrefix).toBe('x:')
  })
})

describe('pingRedis', () => {
  it('true when PING → PONG', async () => {
    expect(await pingRedis({ ping: async () => 'PONG' })).toBe(true)
  })
  it('false when PING throws', async () => {
    expect(
      await pingRedis({
        ping: async () => {
          throw new Error('down')
        },
      }),
    ).toBe(false)
  })
})
