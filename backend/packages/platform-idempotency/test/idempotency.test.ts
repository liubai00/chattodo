import { describe, it, expect } from 'vitest'
import {
  createMemoryIdempotency,
  createRedisIdempotency,
  type RedisSetNxLike,
} from '../src/index.js'

function clock(start = 1_000_000) {
  const ref = { t: start }
  return { now: () => ref.t, advance: (ms: number) => (ref.t += ms) }
}

// fake SET key val PX ms NX + del：键存在(未过期)返回 null，否则写入返回 'OK'
function fakeSetNx(nowFn: () => number): RedisSetNxLike & { store: Map<string, number> } {
  const store = new Map<string, number>()
  return {
    store,
    async set(key, _v, _px, ttlMs, _nx) {
      const exp = store.get(key)
      if (exp !== undefined && exp > nowFn()) return null
      store.set(key, nowFn() + ttlMs)
      return 'OK'
    },
    async del(key) {
      store.delete(key)
      return 1
    },
  }
}

describe('createMemoryIdempotency', () => {
  it('claim is true first time, false while unexpired', async () => {
    const clk = clock()
    const idem = createMemoryIdempotency({ now: clk.now })
    expect(await idem.claim('k', 1000)).toBe(true)
    expect(await idem.claim('k', 1000)).toBe(false)
    clk.advance(1001)
    expect(await idem.claim('k', 1000)).toBe(true)
  })

  it('run executes once, marks duplicates', async () => {
    const idem = createMemoryIdempotency()
    let calls = 0
    const fn = async () => {
      calls++
      return 'done'
    }
    expect(await idem.run('k', 1000, fn)).toEqual({ duplicate: false, result: 'done' })
    expect(await idem.run('k', 1000, fn)).toEqual({ duplicate: true })
    expect(calls).toBe(1)
  })

  it('run RELEASES the key on fn failure so a retry re-runs (no lost side effect)', async () => {
    const idem = createMemoryIdempotency()
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 1) throw new Error('transient')
      return 'ok'
    }
    await expect(idem.run('job', 60_000, flaky)).rejects.toThrow('transient')
    // 键已释放 → 重试重新执行
    expect(await idem.run('job', 60_000, flaky)).toEqual({ duplicate: false, result: 'ok' })
    expect(calls).toBe(2)
  })

  it('release clears a claimed key', async () => {
    const idem = createMemoryIdempotency()
    expect(await idem.claim('k', 1000)).toBe(true)
    await idem.release('k')
    expect(await idem.claim('k', 1000)).toBe(true)
  })
})

describe('createRedisIdempotency (fake SET PX NX)', () => {
  it('claims once across two clients sharing a store (multi-replica dedup)', async () => {
    const clk = clock()
    const store = fakeSetNx(clk.now)
    const a = createRedisIdempotency(store)
    const b = createRedisIdempotency(store)
    expect(await a.claim('k', 1000)).toBe(true)
    expect(await b.claim('k', 1000)).toBe(false)
    clk.advance(1001)
    expect(await b.claim('k', 1000)).toBe(true)
  })

  it('run releases (del) the key on fn failure', async () => {
    const clk = clock()
    const store = fakeSetNx(clk.now)
    const idem = createRedisIdempotency(store)
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 1) throw new Error('boom')
      return calls
    }
    await expect(idem.run('k', 1000, flaky)).rejects.toThrow('boom')
    expect(store.store.has('k')).toBe(false) // 键被 del 释放
    expect(await idem.run('k', 1000, flaky)).toEqual({ duplicate: false, result: 2 })
  })

  it('run returns duplicate on the second successful call', async () => {
    const clk = clock()
    const idem = createRedisIdempotency(fakeSetNx(clk.now))
    let calls = 0
    const fn = async () => ++calls
    expect(await idem.run('k', 1000, fn)).toEqual({ duplicate: false, result: 1 })
    expect(await idem.run('k', 1000, fn)).toEqual({ duplicate: true })
    expect(calls).toBe(1)
  })
})
