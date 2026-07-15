// @linx/platform-eventbus — 实时事件总线：本地进程内扇出 + 可插 Pub/Sub 传输（多副本 SSE 扇出）。
// 语义 1:1 承接现网 services/events.js（修 P：Redis 扇出 + 进程内回退，SSE 无 sticky）：
//  - per-user 频道 linx:evt:<userId>；每副本维护自己的本地 SSE sinks。
//  - redis 模式：publish → transport.publish → 各副本经 psubscribe 收到 → 投递本地 sinks（含发布者自身）。
//  - local 模式（无 transport）：直接投递本地 sinks，单副本功能等价。
//  - 发布失败回退本地投递，绝不因总线故障阻断主流程。
// 零外部依赖：Redis 客户端由 composition root 经 createRedisPubSubTransport 注入（platform 互不 import）。

/** SSE sink（Node ServerResponse 结构子集）；write 抛错即视为断开并剔除。 */
export interface EventSink {
  write(chunk: string): unknown
}

/** 实时事件信封；kind 决定 SSE event 名（缺省 refresh）。 */
export interface LiveEvent {
  kind?: string
  [key: string]: unknown
}

/** Pub/Sub 传输抽象：redis 由适配器实现，测试可注入 fake。 */
export interface PubSubTransport {
  publish(channel: string, message: string): void | Promise<unknown>
  psubscribe(
    pattern: string,
    handler: (channel: string, message: string) => void,
  ): void | Promise<void>
  close(): void | Promise<void>
}

export interface EventBus {
  readonly mode: 'local' | 'redis'
  /** 注册一个用户的 SSE sink，返回取消订阅函数。 */
  subscribe(userId: string, sink: EventSink): () => void
  /** 向某用户推送事件；返回本地即时投递数（redis 模式恒 0，投递异步经订阅回环）。 */
  publish(userId: string, event: LiveEvent): number
  publishMany(userIds: Iterable<string>, event: LiveEvent): number
  /** 连接数：传 userId 为该用户，否则全量。 */
  connectionCount(userId?: string): number
  close(): Promise<void>
}

export interface CreateEventBusOptions {
  /** 提供则进入 redis 模式；否则 local。 */
  transport?: PubSubTransport
  channelPrefix?: string
  /** 传输初始化失败（退化为本地模式）时回调，用于日志观测。 */
  onError?: (err: unknown) => void
}

function frameOf(event: LiveEvent): string {
  // 与 events.js 一致用 truthy 回落：空串 kind 也应退回 'refresh'（SSE 空 event 名会被当默认 message）
  return `event: ${event.kind || 'refresh'}\ndata: ${JSON.stringify(event)}\n\n`
}

export async function createEventBus(opts: CreateEventBusOptions = {}): Promise<EventBus> {
  const prefix = opts.channelPrefix ?? 'linx:evt:'
  let transport = opts.transport
  let closed = false
  const local = new Map<string, Set<EventSink>>()

  function deliverLocal(userId: string, event: LiveEvent): number {
    const set = local.get(userId)
    if (!set || set.size === 0) return 0
    const frame = frameOf(event)
    let sent = 0
    for (const sink of [...set]) {
      try {
        sink.write(frame)
        sent++
      } catch {
        set.delete(sink) // 断开的 sink 剔除
      }
    }
    // 仅当当前映射仍是同一个 set 时才删（防重入 unsubscribe+subscribe 误删新 set）
    if (set.size === 0 && local.get(userId) === set) local.delete(userId)
    return sent
  }

  if (transport) {
    try {
      await transport.psubscribe(prefix + '*', (channel, message) => {
        if (!channel.startsWith(prefix)) return
        try {
          deliverLocal(channel.slice(prefix.length), JSON.parse(message) as LiveEvent)
        } catch {
          /* 坏帧忽略 */
        }
      })
    } catch (err) {
      // 与 events.js 一致：传输初始化失败退化为本地模式，绝不抛断启动。
      opts.onError?.(err)
      try {
        await transport.close()
      } catch {
        /* ignore */
      }
      transport = undefined
    }
  }
  const mode: 'local' | 'redis' = transport ? 'redis' : 'local'

  function publish(userId: string, event: LiveEvent): number {
    if (transport) {
      try {
        const p = transport.publish(prefix + userId, JSON.stringify(event))
        if (p && typeof (p as Promise<unknown>).then === 'function') {
          void (p as Promise<unknown>).catch(() => deliverLocal(userId, event))
        }
      } catch {
        return deliverLocal(userId, event) // 发布同步失败 → 本地兜底
      }
      return 0
    }
    return deliverLocal(userId, event)
  }

  return {
    mode,
    subscribe(userId: string, sink: EventSink): () => void {
      let set = local.get(userId)
      if (!set) {
        set = new Set()
        local.set(userId, set)
      }
      set.add(sink)
      return () => {
        const s = local.get(userId)
        if (s) {
          s.delete(sink)
          if (s.size === 0) local.delete(userId)
        }
      }
    },
    publish,
    publishMany(userIds: Iterable<string>, event: LiveEvent): number {
      let sent = 0
      for (const id of new Set(userIds)) sent += publish(id, event)
      return sent
    },
    connectionCount(userId?: string): number {
      // truthy 判定与 events.js 对齐（空串 userId 走全量）
      if (userId) return local.get(userId)?.size ?? 0
      let n = 0
      for (const s of local.values()) n += s.size
      return n
    },
    async close(): Promise<void> {
      if (closed) return // 幂等
      closed = true
      const t = transport
      transport = undefined // 关闭后 publish 走本地兜底，不再打已断连接
      if (t) {
        try {
          await t.close()
        } catch {
          /* 关闭失败不阻断 shutdown */
        }
      }
      local.clear()
    },
  }
}

/** 最小 Redis 客户端结构（ioredis.Redis 结构性满足；避免 eventbus 直接依赖 ioredis）。 */
export type PMessageListener = (pattern: string, channel: string, message: string) => void

export interface RedisPubSubClient {
  publish(channel: string, message: string): Promise<unknown>
  psubscribe(pattern: string): Promise<unknown>
  on(event: 'pmessage', listener: PMessageListener): unknown
  removeListener?(event: 'pmessage', listener: PMessageListener): unknown
  quit(): Promise<unknown>
  disconnect?(): void
}

/**
 * 由 ioredis pub/sub 客户端对构造 PubSubTransport。
 * pub 与 sub 必须是两条独立连接（订阅连接进入订阅态后不能再发普通命令）。
 */
export function createRedisPubSubTransport(
  pub: RedisPubSubClient,
  sub: RedisPubSubClient,
  opts: { quitTimeoutMs?: number } = {},
): PubSubTransport {
  const quitTimeoutMs = opts.quitTimeoutMs ?? 2000
  const listeners: PMessageListener[] = []

  // 有界关闭：quit 与超时竞速，无论如何都 disconnect 兜底，两条连接并行 →
  // maxRetriesPerRequest:null 下卡住的 QUIT 不会拖死优雅关闭。
  const shut = async (c: RedisPubSubClient): Promise<void> => {
    await Promise.race([
      Promise.resolve(c.quit()).catch(() => undefined),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, quitTimeoutMs)
        t.unref()
      }),
    ])
    c.disconnect?.()
  }

  return {
    publish: (channel, message) => pub.publish(channel, message),
    psubscribe: async (pattern, handler) => {
      const onMsg: PMessageListener = (_pattern, channel, message) => handler(channel, message)
      sub.on('pmessage', onMsg)
      listeners.push(onMsg)
      await sub.psubscribe(pattern)
    },
    close: async () => {
      for (const l of listeners) sub.removeListener?.('pmessage', l)
      listeners.length = 0
      await Promise.allSettled([shut(sub), shut(pub)])
    },
  }
}
