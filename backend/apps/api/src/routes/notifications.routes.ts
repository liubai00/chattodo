import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeNotificationRepo, type Queryable } from '@linx/infra-notifications-pg'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface NotificationsPluginDeps {
  db: Queryable
  clock?: () => Date
  genId?: (prefix: string) => string
}

/**
 * Notifications BC 已迁移路由（组 'notifications'）：读取 + 已读标记。
 *   GET  /api/notifications           — 当前用户全部通知（数组，承 legacy 直接返回）
 *   POST /api/notifications/read-all  — 全部标记已读
 *   POST /api/notifications/:id/read  — 单条标记已读
 * 通知的【写入】仍由 collab/social 的组合根适配器承担（pushNotification 路径），本组只读/标记。
 */
export function makeNotificationsPlugin(deps: NotificationsPluginDeps): MigratedPlugin {
  const { db } = deps
  const repoFor = (userId: string) =>
    makeNotificationRepo({
      db,
      userId,
      ...(deps.clock ? { clock: deps.clock } : {}),
      ...(deps.genId ? { genId: deps.genId } : {}),
    })

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }

  return {
    group: 'notifications',
    register: async (app) => {
      app.get('/api/notifications', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return repoFor(userId).all()
      })

      app.post('/api/notifications/read-all', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        await repoFor(userId).markAllRead()
        return { ok: true }
      })

      app.post('/api/notifications/:id/read', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        await repoFor(userId).markRead((req.params as { id: string }).id)
        return { ok: true }
      })
    },
  }
}
