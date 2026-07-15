// @linx/platform-ratelimit — 滑动窗口限流（修 P4：现网两处重复手写内存限流 + 多实例失效）。
// 内存版 1:1 承接 server/src/lib/rateLimit.js（单实例等价）；Redis 版用 ZSET 跨副本共享计数。
// 键由调用方构造（如 platform-redis.namespacedKey('ratelimit','auth:login',ip)），本包与命名无关。
import { randomUUID } from 'node:crypto'

export interface RateLimitResult {
  /** 未超限（count <= limit）。语义对齐现网 isLimited：count > max 即超。 */
  allowed: boolean
  count: number
  remaining: number
  limit: number
  windowMs: number
}

export interface RateLimitOptions {
  limit: number
  windowMs: number
  /** 时间源，注入以便测试确定化。 */
  now?: () => number
}

export interface RateLimiter {
  /** 记一次命中并返回当前窗口结果。 */
  hit(key: string): Promise<RateLimitResult>
  reset(key: string): Promise<void>
}

function toResult(count: number, limit: number, windowMs: number): RateLimitResult {
  return { allowed: count <= limit, count, remaining: Math.max(0, limit - count), limit, windowMs }
}

/** 进程内滑动窗口日志（承接现网 lib/rateLimit.js；单实例等价，多实例请用 Redis 版）。 */
export function createMemoryRateLimiter(opts: RateLimitOptions): RateLimiter {
  const { limit, windowMs } = opts
  const now = opts.now ?? ((): number => Date.now())
  const buckets = new Map<string, number[]>()
  let lastGc = now()

  return {
    async hit(key: string): Promise<RateLimitResult> {
      const t = now()
      const arr = (buckets.get(key) ?? []).filter((ts) => ts > t - windowMs)
      arr.push(t)
      buckets.set(key, arr)
      // 机会式 GC：仅当规模超阈值且距上次 GC 超过一个窗口才全扫，避免每次命中 O(N·M) 扫描
      if (buckets.size > 10_000 && t - lastGc >= windowMs) {
        lastGc = t
        for (const [k, v] of buckets) {
          const alive = v.filter((ts) => ts > t - windowMs)
          if (alive.length) buckets.set(k, alive)
          else buckets.delete(k)
        }
      }
      return toResult(arr.length, limit, windowMs)
    },
    async reset(key: string): Promise<void> {
      buckets.delete(key)
    },
  }
}

/** Redis ZSET 命令子集（ioredis 结构性满足）。 */
export interface RedisZSetLike {
  zadd(key: string, score: number, member: string): Promise<unknown>
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown>
  zcard(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<unknown>
  del(key: string): Promise<unknown>
}

/** Redis 滑动窗口（ZSET）：跨副本共享计数（修 P4 多实例限流失效）。 */
export function createRedisRateLimiter(
  client: RedisZSetLike,
  opts: RateLimitOptions,
): RateLimiter {
  const { limit, windowMs } = opts
  const now = opts.now ?? ((): number => Date.now())

  return {
    async hit(key: string): Promise<RateLimitResult> {
      const t = now()
      // 先剔除窗口外，再计入本次，再统计。member 用 randomUUID 保证【全局唯一】
      // （跨副本同毫秒也不碰撞，避免 ZADD 去重导致少计 → 限流绕过）。
      await client.zremrangebyscore(key, 0, t - windowMs)
      await client.zadd(key, t, `${t}-${randomUUID()}`)
      const count = await client.zcard(key)
      await client.pexpire(key, windowMs)
      return toResult(count, limit, windowMs)
    },
    async reset(key: string): Promise<void> {
      await client.del(key)
    },
  }
}
