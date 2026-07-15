import { describe, it, expect } from 'vitest'
import { createMemoryCache, createRedisCache, type RedisStringLike } from '../src/index.js'

function clock(start = 1_000_000) {
  const ref = { t: start }
  return { now: () => ref.t, advance: (ms: number) => (ref.t += ms) }
}

function fakeRedisString(): RedisStringLike & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(key) {
      return store.has(key) ? (store.get(key) as string) : null
    },
    async set(key, value) {
      store.set(key, value)
      return 'OK'
    },
    async del(key) {
      store.delete(key)
      return 1
    },
  }
}

describe('createMemoryCache', () => {
  it('get/set roundtrip with typed value', async () => {
    const c = createMemoryCache()
    await c.set('k', { a: 1 })
    expect(await c.get<{ a: number }>('k')).toEqual({ a: 1 })
    expect(await c.get('missing')).toBeUndefined()
  })

  it('expires after ttl', async () => {
    const clk = clock()
    const c = createMemoryCache({ now: clk.now })
    await c.set('k', 'v', 100)
    expect(await c.get('k')).toBe('v')
    clk.advance(101)
    expect(await c.get('k')).toBeUndefined()
  })

  it('cached loads on miss, serves on hit, and invalidate forces reload', async () => {
    const c = createMemoryCache()
    let calls = 0
    const load = async () => {
      calls++
      return calls
    }
    expect(await c.cached('k', 1000, load)).toBe(1)
    expect(await c.cached('k', 1000, load)).toBe(1) // hit, loader not called again
    expect(calls).toBe(1)
    await c.invalidate('k')
    expect(await c.cached('k', 1000, load)).toBe(2)
    expect(calls).toBe(2)
  })

  it('dedupes concurrent misses (stampede protection)', async () => {
    const c = createMemoryCache()
    let calls = 0
    const load = async () => {
      calls++
      await Promise.resolve()
      return 'x'
    }
    const [a, b] = await Promise.all([c.cached('k', 1000, load), c.cached('k', 1000, load)])
    expect(a).toBe('x')
    expect(b).toBe('x')
    expect(calls).toBe(1) // 只加载一次
  })

  it('a throwing loader does not poison the key (inflight cleaned)', async () => {
    const c = createMemoryCache()
    await expect(
      c.cached('k', 1000, () => {
        throw new Error('sync boom') // 同步抛错
      }),
    ).rejects.toThrow('sync boom')
    // key 未被残留的 rejected promise 污染 → 后续可正常加载
    expect(await c.cached('k', 1000, async () => 'ok')).toBe('ok')
  })

  it('ttlMs=0 means no-expiry (consistent, no permanent-cache surprise)', async () => {
    const clk = clock()
    const c = createMemoryCache({ now: clk.now })
    await c.set('k', 'v', 0)
    clk.advance(10_000_000)
    expect(await c.get('k')).toBe('v') // 0 = 不过期
  })
})

describe('createRedisCache (fake string store)', () => {
  it('serializes/deserializes JSON via get/set', async () => {
    const c = createRedisCache(fakeRedisString())
    await c.set('k', { a: 1, b: [2, 3] })
    expect(await c.get<{ a: number; b: number[] }>('k')).toEqual({ a: 1, b: [2, 3] })
  })

  it('cached read-through + invalidate', async () => {
    const store = fakeRedisString()
    const c = createRedisCache(store)
    let calls = 0
    const load = async () => ++calls
    expect(await c.cached('k', 1000, load)).toBe(1)
    expect(await c.cached('k', 1000, load)).toBe(1)
    await c.invalidate('k')
    expect(await c.cached('k', 1000, load)).toBe(2)
  })

  it('does not pass undefined to client.set (unserializable value → del, no crash)', async () => {
    const store = fakeRedisString()
    const c = createRedisCache(store)
    await store.set('k', 'stale')
    await c.set('k', undefined) // 不可序列化 → 清旧值，不抛
    expect(await c.get('k')).toBeUndefined()
    expect(store.store.has('k')).toBe(false)
  })
})
