import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Queryable } from '@linx/infra-tasks-pg'
import type { Mention } from '@linx/domain-collab'
import type { LlmClient } from '@linx/platform-llm'
import { createMemoryRateLimiter, type RateLimiter } from '@linx/platform-ratelimit'
import type { MigratedPlugin } from '../facade/build-api.js'
import { buildChatApp } from '../composition/chat-wiring.js'

export interface ChatPluginDeps {
  db: Queryable
  publish: (userId: string, payload: unknown) => void
  publishMany: (userIds: readonly string[], payload: unknown) => void
  /** LLM 客户端（agent 路径）；省略则真实 fetch。 */
  llm?: LlmClient
  /** 聊天限流器；省略则进程内 40/60s（key chat:<userId>）。 */
  chatLimiter?: RateLimiter
  clock?: () => Date
  genId?: (prefix: string) => string
}

function cleanMentions(m: unknown): Mention[] {
  if (!Array.isArray(m)) return []
  return m.filter((x): x is Mention => !!x && typeof x === 'object' && typeof (x as { type?: unknown }).type === 'string')
}

/**
 * Chat BC 已迁移路由（组 'chat'）：聊天回合（非流式 + SSE 流式）。
 *   POST /api/chat          {message, conversationId?, mentions?}  → 统一 TurnResult（JSON）
 *   POST /api/chat/stream   同上 → SSE：status → delta* → done|error（前端依赖此线协议）
 * 校验（message 必填 400 / chatLimited 40·60s 429）在 hijack 前以普通 JSON 返回。
 */
export function makeChatPlugin(deps: ChatPluginDeps): MigratedPlugin {
  const { db, publish, publishMany } = deps
  const wiring = {
    db,
    publish,
    publishMany,
    ...(deps.llm ? { llm: deps.llm } : {}),
    ...(deps.clock ? { clock: deps.clock } : {}),
    ...(deps.genId ? { genId: deps.genId } : {}),
  }
  const chatLimiter = deps.chatLimiter ?? createMemoryRateLimiter({ limit: 40, windowMs: 60_000 })

  const gate = async (
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ userId: string; name: string; message: string; conversationId?: string; mentions: Mention[] } | undefined> => {
    const u = req.user
    if (!u) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    const body = (req.body ?? {}) as { message?: unknown; conversationId?: unknown; mentions?: unknown }
    const message = String(body.message ?? '').trim()
    if (!message) {
      void reply.status(400).send({ error: 'message is required' })
      return undefined
    }
    if (!(await chatLimiter.hit('chat:' + u.id)).allowed) {
      void reply.status(429).send({ error: '消息太频繁了，休息一下再发～' })
      return undefined
    }
    return {
      userId: u.id,
      name: u.name,
      message,
      ...(typeof body.conversationId === 'string' ? { conversationId: body.conversationId } : {}),
      mentions: cleanMentions(body.mentions),
    }
  }

  return {
    group: 'chat',
    register: async (app) => {
      app.post('/api/chat', async (req, reply) => {
        const g = await gate(req, reply)
        if (!g) return
        const chatApp = buildChatApp({ ...wiring, userId: g.userId })
        return chatApp.chat({
          message: g.message,
          user: { id: g.userId, name: g.name },
          mentions: g.mentions,
          ...(g.conversationId ? { conversationId: g.conversationId } : {}),
        })
      })

      app.post('/api/chat/stream', async (req, reply) => {
        const g = await gate(req, reply)
        if (!g) return // 400/429/401 已作为普通 JSON 返回
        reply.hijack()
        const raw = reply.raw
        raw.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        const send = (event: string, data: unknown): void => {
          try {
            raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          } catch {
            /* 断连后写入吞掉 */
          }
        }
        try {
          const chatApp = buildChatApp({ ...wiring, userId: g.userId })
          const result = await chatApp.chat({
            message: g.message,
            user: { id: g.userId, name: g.name },
            mentions: g.mentions,
            ...(g.conversationId ? { conversationId: g.conversationId } : {}),
            onEvent: (e) => {
              if (e.type === 'status') send('status', { intent: e.intent })
              else if (e.type === 'delta') send('delta', { text: e.text })
            },
          })
          send('done', result)
        } catch (err) {
          send('error', { error: (err as Error).message || '处理失败' })
        } finally {
          try {
            raw.end()
          } catch {
            /* already ended */
          }
        }
      })
    },
  }
}
