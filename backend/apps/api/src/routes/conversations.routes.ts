import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  makeConversationRepo,
  makeChatReadRepo,
  type Queryable,
} from '@linx/infra-conversations-pg'
import type { ChatMessage } from '@linx/domain-conversations'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface ConversationsPluginDeps {
  db: Queryable
  clock?: () => Date
  genId?: (prefix: string) => string
}

/**
 * Conversations BC 已迁移路由（组 'conversations'）：多对话列表/新建/改名/删除 + 拉某会话消息。
 *   GET    /api/conversations
 *   POST   /api/conversations {title?}
 *   GET    /api/conversations/:id/messages  — 消息 + 用户消息→生成实体回链
 *   PATCH  /api/conversations/:id {title}
 *   DELETE /api/conversations/:id
 * 聊天【发送】属 P7 agent；本组只管会话生命周期与历史读取。
 */
export function makeConversationsPlugin(deps: ConversationsPluginDeps): MigratedPlugin {
  const { db } = deps
  const opt = {
    ...(deps.clock ? { clock: deps.clock } : {}),
    ...(deps.genId ? { genId: deps.genId } : {}),
  }
  const convFor = (userId: string) => makeConversationRepo({ db, userId, ...opt })

  const actor = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }

  return {
    group: 'conversations',
    register: async (app) => {
      app.get('/api/conversations', async (req, reply) => {
        const userId = actor(req, reply)
        if (!userId) return
        return { conversations: await convFor(userId).list() }
      })

      app.post('/api/conversations', async (req, reply) => {
        const userId = actor(req, reply)
        if (!userId) return
        const title = String((req.body as { title?: unknown } | undefined)?.title ?? '').trim()
        return convFor(userId).create(title || '新对话')
      })

      app.get('/api/conversations/:id/messages', async (req, reply) => {
        const userId = actor(req, reply)
        if (!userId) return
        const id = (req.params as { id: string }).id
        const conv = await convFor(userId).get(id)
        if (!conv) return reply.status(404).send({ error: '会话不存在' })
        const chatRepo = makeChatReadRepo({ db, userId })
        // capture_records 为 tasks-BC 表；此处组合根用原始只读查询（承 captureRecords.all，created_at DESC）。
        const [rows, records] = await Promise.all([
          chatRepo.all(id),
          db.execute<{ raw_input: string | null; result_entity_type: string | null; result_entity_id: string | null }>(
            'SELECT raw_input, result_entity_type, result_entity_id FROM capture_records WHERE user_id = $1 ORDER BY created_at DESC',
            [userId],
          ),
        ])
        // 历史回链：用户消息 → 它生成的实体（按原文匹配最近一条生成记录 = 迭代到的首条）。
        const byRaw = new Map<string, { refType: string; refId: string }>()
        for (const r of records) {
          if (r.raw_input && r.result_entity_id && !byRaw.has(r.raw_input)) {
            byRaw.set(r.raw_input, { refType: r.result_entity_type ?? '', refId: r.result_entity_id })
          }
        }
        const chat = rows.map((m: ChatMessage) => {
          const link = m.role === 'user' ? byRaw.get(m.text) : undefined
          return link ? { ...m, ...link } : m
        })
        return { conversation: conv, chat }
      })

      app.patch('/api/conversations/:id', async (req, reply) => {
        const userId = actor(req, reply)
        if (!userId) return
        const title = String((req.body as { title?: unknown } | undefined)?.title ?? '').trim()
        if (!title) return reply.status(400).send({ error: '标题不能为空' })
        const conv = await convFor(userId).rename((req.params as { id: string }).id, title)
        if (!conv) return reply.status(404).send({ error: '会话不存在' })
        return conv
      })

      app.delete('/api/conversations/:id', async (req, reply) => {
        const userId = actor(req, reply)
        if (!userId) return
        await convFor(userId).remove((req.params as { id: string }).id)
        return { ok: true }
      })
    },
  }
}
