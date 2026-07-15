import { describe, it, expect } from 'vitest'
import {
  createMemoryRateLimiter,
  createRedisRateLimiter,
  type RedisZSetLike,
} from '../src/index.js'

// 可控时钟
function clock(start = 1_000_000) {
  const ref = { t: start }
  return { now: () => ref.t, advance: (ms: number) => (ref.t += ms) }
}

// 内存 ZSET fake（实现限流所需子集）
function fakeZset(): RedisZSetLike & { store: Map<string, { score: number; member: string }[]> } {
  const store = new Map<string, { score: number; member: string }[]>()
  return {
    store,
    async zadd(key, score, member) {
      // 真 ZADD 语义：同 member 只更新 score，不增加基数
      const arr = store.get(key) ?? []
      const existing = arr.find((e) => e.member === member)
      if (existing) existing.score = score
      else arr.push({ score, member })
      store.set(key, arr)
      return 1
    },
    async zremrangebyscore(key, min, max) {
      const lo = Number(min)
      const hi = Number(max)
      const arr = (store.get(key) ?? []).filter((e) => e.score < lo || e.score > hi)
      store.set(key, arr)
      return 0
    },
    async zcard(key) {
      return store.get(key)?.length ?? 0
    },
    async pexpire() {
      return 1
    },
    async del(key) {
      store.delete(key)
      return 1
    },
  }
}

describe('createMemoryRateLimiter', () => {
  it('allows up to the limit then blocks within the window', async () => {
    const c = clock()
    const rl = createMemoryRateLimiter({ limit: 2, windowMs: 1000, now: c.now })
    expect((await rl.hit('k')).allowed).toBe(true) // count 1
    expect((await rl.hit('k')).allowed).toBe(true) // count 2
    const third = await rl.hit('k')
    expect(third.allowed).toBe(false) // count 3 > 2
    expect(third.count).toBe(3)
    expect(third.remaining).toBe(0)
  })

  it('slides: entries older than the window drop out', async () => {
    const c = clock()
    const rl = createMemoryRateLimiter({ limit: 1, windowMs: 1000, now: c.now })
    expect((await rl.hit('k')).allowed).toBe(true)
    expect((await rl.hit('k')).allowed).toBe(false)
    c.advance(1001) // 越过窗口
    expect((await rl.hit('k')).allowed).toBe(true)
  })

  it('keys are isolated', async () => {
    const rl = createMemoryRateLimiter({ limit: 1, windowMs: 1000 })
    expect((await rl.hit('a')).allowed).toBe(true)
    expect((await rl.hit('b')).allowed).toBe(true)
  })

  it('reset clears a key', async () => {
    const c = clock()
    const rl = createMemoryRateLimiter({ limit: 1, windowMs: 1000, now: c.now })
    await rl.hit('k')
    await rl.reset('k')
    expect((await rl.hit('k')).allowed).toBe(true)
  })
})

describe('createRedisRateLimiter (fake ZSET)', () => {
  it('shares the sliding-window count via the store', async () => {
    const c = clock()
    const z = fakeZset()
    const rl = createRedisRateLimiter(z, { limit: 2, windowMs: 1000, now: c.now })
    expect((await rl.hit('k')).allowed).toBe(true)
    expect((await rl.hit('k')).allowed).toBe(true)
    expect((await rl.hit('k')).allowed).toBe(false)
    c.advance(1001)
    expect((await rl.hit('k')).allowed).toBe(true) // 旧条目被 zremrangebyscore 剔除
  })

  it('two limiters over the same store enforce a shared limit (multi-replica)', async () => {
    const c = clock()
    const z = fakeZset()
    const a = createRedisRateLimiter(z, { limit: 2, windowMs: 1000, now: c.now })
    const b = createRedisRateLimiter(z, { limit: 2, windowMs: 1000, now: c.now })
    expect((await a.hit('k')).allowed).toBe(true)
    expect((await b.hit('k')).allowed).toBe(true)
    expect((await a.hit('k')).allowed).toBe(false) // 第三次跨"副本"仍超限
  })
})
