import type { EventBus } from '@linx/platform-eventbus'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface EventsPluginDeps {
  /** 与各插件 publish/publishMany 共享的【同一个】总线实例——否则新栈发的事件到不了订阅端。 */
  bus: EventBus
}

/**
 * Realtime BC 已迁移路由（组 'events'）：长连 SSE 实时推送通道。
 *   GET /api/events — 订阅当前用户的实时事件（邀请/回执/共享任务更新/聊天注入）。
 * 关键：订阅挂在与 collab/social/chat 插件 publish 相同的 platform-eventbus 上，闭合"发布→投递"回环。
 * 帧格式与心跳与现网 events.js 逐字节一致（前端 EventSource 依赖）。
 */
export function makeEventsPlugin(deps: EventsPluginDeps): MigratedPlugin {
  const { bus } = deps
  return {
    group: 'events',
    register: async (app) => {
      app.get('/api/events', async (req, reply) => {
        if (!req.user) return reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
        reply.hijack()
        const raw = reply.raw
        raw.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        raw.write(`event: hello\ndata: {"ok":true}\n\n`)
        // reply.raw（ServerResponse）即 EventSink（有 write）；断连时 write 抛错 → 总线自动剔除。
        const unsubscribe = bus.subscribe(req.user.id, raw)
        const heartbeat = setInterval(() => {
          try {
            raw.write(`: ping\n\n`)
          } catch {
            /* closed */
          }
        }, 25000)
        const cleanup = (): void => {
          clearInterval(heartbeat)
          unsubscribe()
          try {
            raw.end()
          } catch {
            /* already closed */
          }
        }
        req.raw.on('close', cleanup)
        req.raw.on('error', cleanup)
      })
    },
  }
}
