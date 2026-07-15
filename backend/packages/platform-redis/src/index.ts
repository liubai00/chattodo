// @linx/platform-redis — ioredis 连接工厂 + 命名空间 key（cache/ratelimit/events/queue/idempotency/session 分前缀）。
// 由 composition root 建连接并注入到消费者（platform-eventbus / cache / ratelimit …），
// 保持 platform 包互不 import。BullMQ 需 maxRetriesPerRequest=null，故默认置 null。
import { Redis, type RedisOptions } from 'ioredis'

export type { Redis }

export const KEY_ROOT = 'linx'

export type RedisNamespace =
  | 'cache'
  | 'ratelimit'
  | 'events'
  | 'queue'
  | 'idempotency'
  | 'session'

/** 统一 key 命名：linx:<ns>:<...parts>。前缀由此单点注入，杜绝散落硬编码。 */
export function namespacedKey(ns: RedisNamespace, ...parts: string[]): string {
  return [KEY_ROOT, ns, ...parts].join(':')
}

export interface CreateRedisOptions {
  /** 惰性连接（构造不立即连），默认 true。 */
  lazyConnect?: boolean
  /** ioredis keyPrefix（连接级前缀）。 */
  keyPrefix?: string
  /**
   * 每请求最大重试；BullMQ 要求 null（无限阻塞命令），默认 null。
   * 普通缓存/限流连接可显式传数字以便快速失败。
   */
  maxRetriesPerRequest?: number | null
}

export function buildRedisOptions(opts: CreateRedisOptions = {}): RedisOptions {
  const base: RedisOptions = {
    lazyConnect: opts.lazyConnect ?? true,
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? null,
    enableReadyCheck: true,
  }
  return opts.keyPrefix ? { ...base, keyPrefix: opts.keyPrefix } : base
}

/** 建 ioredis 连接（默认惰性；需两条独立连接做 pub/sub 时各调一次）。 */
export function createRedis(url: string, opts: CreateRedisOptions = {}): Redis {
  return new Redis(url, buildRedisOptions(opts))
}

/** 就绪探针：PING 成功即 true（供 /ready 聚合；由 composition root 注册）。 */
export async function pingRedis(client: { ping(): Promise<unknown> }): Promise<boolean> {
  try {
    return (await client.ping()) === 'PONG'
  } catch {
    return false
  }
}
