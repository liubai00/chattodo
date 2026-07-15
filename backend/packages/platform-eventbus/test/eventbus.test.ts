import { describe, it, expect } from 'vitest'
import {
  createEventBus,
  createRedisPubSubTransport,
  type EventSink,
  type PMessageListener,
  type PubSubTransport,
  type RedisPubSubClient,
} from '../src/index.js'

function sink(): EventSink & { frames: string[] } {
  const frames: string[] = []
  return { frames, write: (c: string) => frames.push(c) }
}

// 共享内存 broker，模拟多副本经同一 Redis pub/sub 扇出
function fakeBroker() {
  const subs: { pattern: string; fn: (channel: string, message: string) => void }[] = []
  const matches = (pattern: string, channel: string): boolean =>
    pattern.endsWith('*') ? channel.startsWith(pattern.slice(0, -1)) : pattern === channel
  return {
    transport(): PubSubTransport {
      return {
        publish: (channel, message) => {
          for (const s of subs) if (matches(s.pattern, channel)) s.fn(channel, message)
        },
        psubscribe: (pattern, fn) => {
          subs.push({ pattern, fn })
        },
        close: () => {},
      }
    },
  }
}

describe('EventBus · local mode', () => {
  it('fans out to all sinks of a user and formats an SSE frame', async () => {
    const bus = await createEventBus()
    expect(bus.mode).toBe('local')
    const a = sink()
    const b = sink()
    bus.subscribe('u1', a)
    bus.subscribe('u1', b)
    const sent = bus.publish('u1', { kind: 'task.created', id: 't1' })
    expect(sent).toBe(2)
    expect(a.frames[0]).toBe('event: task.created\ndata: {"kind":"task.created","id":"t1"}\n\n')
    expect(b.frames).toHaveLength(1)
  })

  it('defaults event name to refresh when kind is absent', async () => {
    const bus = await createEventBus()
    const a = sink()
    bus.subscribe('u1', a)
    bus.publish('u1', { data: 1 })
    expect(a.frames[0]?.startsWith('event: refresh\n')).toBe(true)
  })

  it('does not deliver to other users', async () => {
    const bus = await createEventBus()
    const a = sink()
    bus.subscribe('u1', a)
    expect(bus.publish('u2', { kind: 'x' })).toBe(0)
    expect(a.frames).toHaveLength(0)
  })

  it('unsubscribe removes the sink and cleans empty user sets', async () => {
    const bus = await createEventBus()
    const a = sink()
    const off = bus.subscribe('u1', a)
    off()
    expect(bus.connectionCount('u1')).toBe(0)
    expect(bus.connectionCount()).toBe(0)
    expect(bus.publish('u1', { kind: 'x' })).toBe(0)
  })

  it('prunes a sink whose write throws (disconnected socket)', async () => {
    const bus = await createEventBus()
    const dead: EventSink = {
      write() {
        throw new Error('EPIPE')
      },
    }
    const live = sink()
    bus.subscribe('u1', dead)
    bus.subscribe('u1', live)
    const sent = bus.publish('u1', { kind: 'x' })
    expect(sent).toBe(1)
    expect(bus.connectionCount('u1')).toBe(1)
    expect(live.frames).toHaveLength(1)
  })

  it('publishMany dedupes user ids', async () => {
    const bus = await createEventBus()
    const a = sink()
    bus.subscribe('u1', a)
    const sent = bus.publishMany(['u1', 'u1', 'u2'], { kind: 'x' })
    expect(sent).toBe(1)
    expect(a.frames).toHaveLength(1)
  })

  it('empty-string kind falls back to refresh event name (events.js parity)', async () => {
    const bus = await createEventBus()
    const a = sink()
    bus.subscribe('u1', a)
    bus.publish('u1', { kind: '' })
    expect(a.frames[0]?.startsWith('event: refresh\n')).toBe(true)
  })

  it('close is idempotent and publish after close is a local no-op', async () => {
    const bus = await createEventBus()
    const a = sink()
    bus.subscribe('u1', a)
    await bus.close()
    await bus.close() // 二次 close 不抛
    expect(bus.publish('u1', { kind: 'x' })).toBe(0)
    expect(a.frames).toHaveLength(0)
  })
})

describe('EventBus · redis mode (fake transport)', () => {
  it('fans out across two instances via the shared broker', async () => {
    const broker = fakeBroker()
    const busA = await createEventBus({ transport: broker.transport() })
    const busB = await createEventBus({ transport: broker.transport() })
    expect(busA.mode).toBe('redis')

    const a = sink()
    const b = sink()
    busA.subscribe('u1', a)
    busB.subscribe('u1', b)

    // 在 A 发布，A 与 B 的本地 sink 都应通过订阅回环收到
    const immediate = busA.publish('u1', { kind: 'ping' })
    expect(immediate).toBe(0) // redis 模式同步返回 0
    expect(a.frames).toHaveLength(1)
    expect(b.frames).toHaveLength(1)
    expect(b.frames[0]).toContain('"kind":"ping"')
  })

  it('degrades to local mode when transport init (psubscribe) fails, never throws', async () => {
    let captured: unknown
    const transport: PubSubTransport = {
      publish() {},
      psubscribe() {
        throw new Error('subscribe failed')
      },
      close() {},
    }
    const bus = await createEventBus({ transport, onError: (e) => (captured = e) })
    expect(bus.mode).toBe('local')
    expect((captured as Error).message).toBe('subscribe failed')
    // 退化后本地投递仍工作
    const a = sink()
    bus.subscribe('u1', a)
    expect(bus.publish('u1', { kind: 'x' })).toBe(1)
  })

  it('falls back to local delivery when publish throws synchronously', async () => {
    const transport: PubSubTransport = {
      publish() {
        throw new Error('redis down')
      },
      psubscribe() {},
      close() {},
    }
    const bus = await createEventBus({ transport })
    const a = sink()
    bus.subscribe('u1', a)
    const sent = bus.publish('u1', { kind: 'x' })
    expect(sent).toBe(1) // 兜底本地投递
    expect(a.frames).toHaveLength(1)
  })
})

describe('createRedisPubSubTransport', () => {
  it('wires publish and pmessage through injected ioredis-like clients', async () => {
    const messages: Array<[string, string]> = []
    let pmessageHandler: ((p: string, c: string, m: string) => void) | undefined
    const pub: RedisPubSubClient = {
      publish: async (c, m) => {
        messages.push([c, m])
        pmessageHandler?.('linx:evt:*', c, m)
        return 1
      },
      psubscribe: async () => 1,
      on: () => undefined,
      quit: async () => 'OK',
    }
    const sub: RedisPubSubClient = {
      publish: async () => 0,
      psubscribe: async () => 1,
      on: (_e, listener) => {
        pmessageHandler = listener
        return undefined
      },
      quit: async () => 'OK',
    }
    const transport = createRedisPubSubTransport(pub, sub)
    const bus = await createEventBus({ transport })
    const a = sink()
    bus.subscribe('u9', a)
    bus.publish('u9', { kind: 'hello' })
    expect(messages[0]?.[0]).toBe('linx:evt:u9')
    expect(a.frames[0]).toContain('"kind":"hello"')
    await bus.close()
  })

  it('close removes the pmessage listener and shuts both clients (no leak / no hang)', async () => {
    const removed: PMessageListener[] = []
    let quits = 0
    let disconnects = 0
    const mk = (): RedisPubSubClient => ({
      publish: async () => 1,
      psubscribe: async () => 1,
      on: () => undefined,
      removeListener: (_e, l) => {
        removed.push(l)
        return undefined
      },
      quit: async () => {
        quits++
        return 'OK'
      },
      disconnect: () => {
        disconnects++
      },
    })
    const pub = mk()
    const sub = mk()
    const transport = createRedisPubSubTransport(pub, sub)
    await transport.psubscribe('linx:evt:*', () => {})
    await transport.close()
    expect(removed).toHaveLength(1) // sub 的 pmessage 监听器被移除
    expect(quits).toBe(2) // sub + pub 都 quit
    expect(disconnects).toBe(2) // 都 disconnect 兜底
  })
})
