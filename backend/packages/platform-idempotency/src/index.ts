// @linx/platform-idempotency — 幂等键（写接口/消费者去重）。
// Redis 版用 SET PX ms NX 原子占用；内存版供本地/测试/单实例。键由调用方构造。
//
// 语义（对齐 BullMQ 等 at-least-once 消费者去重）：键标记「已成功完成」而非「已尝试」。
// run() 在 fn 抛错时【释放键并重抛】，使消费者重试能重新执行 → 不丢副作用。
// ⚠ 因此 fn 必须可安全重跑（幂等/可重试）；若 fn 有非幂等的部分副作用，请改用两态
//   （pending/completed）方案而非本包的删除式释放。

export interface IdempotencyResult<T> {
  /** true = 该键此前已成功占用（本次被判为重复）。 */
  duplicate: boolean
  /** duplicate=false 时为 fn 结果。 */
  result?: T
}

export interface Idempotency {
  /** 原子占用；true=首次（应执行），false=已被占用（应跳过）。 */
  claim(key: string, ttlMs: number): Promise<boolean>
  /** 手动释放键（配合直接使用 claim 的调用方）。 */
  release(key: string): Promise<void>
  /** 首次则执行 fn 返回其结果；重复则不执行返回 { duplicate:true }；fn 抛错则释放键并重抛。 */
  run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<IdempotencyResult<T>>
}

export function createMemoryIdempotency(opts: { now?: () => number } = {}): Idempotency {
  const now = opts.now ?? ((): number => Date.now())
  const seen = new Map<string, number>() // key → expiresAt
  let sinceGc = 0

  const gc = (t: number): void => {
    for (const [k, exp] of seen) if (exp <= t) seen.delete(k)
  }

  const claim = async (key: string, ttlMs: number): Promise<boolean> => {
    const t = now()
    // 机会式 GC，避免过期键无界堆积（每 ~1024 次且规模超阈值才全扫）
    if (++sinceGc >= 1024) {
      sinceGc = 0
      if (seen.size > 10_000) gc(t)
    }
    const e = seen.get(key)
    if (e !== undefined && e > t) return false
    seen.set(key, t + ttlMs)
    return true
  }

  const release = async (key: string): Promise<void> => {
    seen.delete(key)
  }

  const run = async <T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<IdempotencyResult<T>> => {
    if (!(await claim(key, ttlMs))) return { duplicate: true }
    try {
      const result = await fn()
      return { duplicate: false, result }
    } catch (e) {
      seen.delete(key) // 释放，使重试可重新执行
      throw e
    }
  }

  return { claim, release, run }
}

/**
 * Redis SET 命令子集（ioredis 结构性满足）。
 * 注意参数顺序 PX ms NX（与 ioredis 的类型化重载一致）：成功返回 'OK'，键已存在返回 null。
 */
export interface RedisSetNxLike {
  set(
    key: string,
    value: string,
    px: 'PX',
    ttlMs: number,
    nx: 'NX',
  ): Promise<'OK' | null | unknown>
  del(key: string): Promise<unknown>
}

export function createRedisIdempotency(client: RedisSetNxLike): Idempotency {
  const claim = async (key: string, ttlMs: number): Promise<boolean> => {
    const res = await client.set(key, '1', 'PX', ttlMs, 'NX')
    return res !== null
  }

  const release = async (key: string): Promise<void> => {
    await client.del(key)
  }

  const run = async <T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<IdempotencyResult<T>> => {
    if (!(await claim(key, ttlMs))) return { duplicate: true }
    try {
      const result = await fn()
      return { duplicate: false, result }
    } catch (e) {
      await client.del(key) // 释放，使重试可重新执行
      throw e
    }
  }

  return { claim, release, run }
}
