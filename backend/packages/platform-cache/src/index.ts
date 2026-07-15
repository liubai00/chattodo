// @linx/platform-cache — 读穿缓存 cached() + 主动失效 invalidate()（单层）。
// 内存版（本地/测试/单实例）+ Redis 版（JSON 序列化，PX TTL）。键由调用方构造。
// TTL 语义统一：ttlMs 未传或 <=0 视为「不过期」（两后端一致，避免 PX 0 非法）。

export interface Cache {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
  /** 读穿：命中直接返回；未命中调用 loader、写入（TTL）、返回。 */
  cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T>
  invalidate(key: string): Promise<void>
}

function hasTtl(ttlMs?: number): boolean {
  return ttlMs !== undefined && ttlMs > 0
}

interface Entry {
  value: unknown
  /** 0 = 永不过期 */
  expiresAt: number
}

export function createMemoryCache(opts: { now?: () => number } = {}): Cache {
  const now = opts.now ?? ((): number => Date.now())
  const store = new Map<string, Entry>()
  // 防击穿：同 key 并发未命中共享同一个 loader promise
  const inflight = new Map<string, Promise<unknown>>()

  function live(key: string): Entry | undefined {
    const e = store.get(key)
    if (!e) return undefined
    if (e.expiresAt !== 0 && e.expiresAt <= now()) {
      store.delete(key)
      return undefined
    }
    return e
  }

  function put(key: string, value: unknown, ttlMs?: number): void {
    store.set(key, { value, expiresAt: hasTtl(ttlMs) ? now() + (ttlMs as number) : 0 })
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return live(key)?.value as T | undefined
    },
    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
      put(key, value, ttlMs)
    },
    async cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
      const hit = live(key)
      if (hit) return hit.value as T
      const pending = inflight.get(key)
      if (pending) return pending as Promise<T>
      // Promise.resolve().then 确保 loader 的同步抛错也转为 rejection；
      // inflight 清理挂在 set 之后，杜绝「同步抛错 → finally 早于 set → 残留污染 key」。
      const p = Promise.resolve()
        .then(() => loader())
        .then((value) => {
          put(key, value, ttlMs)
          return value
        })
      inflight.set(key, p)
      void p.finally(() => inflight.delete(key)).catch(() => undefined)
      return p
    },
    async invalidate(key: string): Promise<void> {
      store.delete(key)
    },
  }
}

/** Redis 字符串命令子集（ioredis 结构性满足）。 */
export interface RedisStringLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode?: 'PX', ttlMs?: number): Promise<unknown>
  del(key: string): Promise<unknown>
}

export function createRedisCache(client: RedisStringLike): Cache {
  async function put(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const raw = JSON.stringify(value)
    if (raw === undefined) {
      // 不可序列化（undefined/函数）→ 不缓存，清掉旧值（get 将回落 loader）
      await client.del(key)
      return
    }
    if (hasTtl(ttlMs)) await client.set(key, raw, 'PX', ttlMs as number)
    else await client.set(key, raw)
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const raw = await client.get(key)
      return raw === null ? undefined : (JSON.parse(raw) as T)
    },
    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
      await put(key, value, ttlMs)
    },
    async cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
      const raw = await client.get(key)
      if (raw !== null) return JSON.parse(raw) as T
      const value = await loader()
      await put(key, value, ttlMs)
      return value
    },
    async invalidate(key: string): Promise<void> {
      await client.del(key)
    },
  }
}
