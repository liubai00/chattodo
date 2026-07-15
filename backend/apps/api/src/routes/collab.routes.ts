import type { FastifyReply, FastifyRequest } from 'fastify'
import { makePrefixedId } from '@linx/kernel-ids'
import {
  makeCollaboratorRepo,
  makeAutoRuleRepo,
  type Queryable,
} from '@linx/infra-collab-pg'
import { makeCollabApp } from '@linx/app-collab'
import type { RespondMode } from '@linx/domain-collab'
import type { MigratedPlugin } from '../facade/build-api.js'
import {
  makeClocks,
  makeActivityGateway,
  makeChatInjector,
  makeEventBus,
  makeFriendCircle,
  makeNotifierForUser,
  makeTaskGateway,
  makeUserDirectory,
  buildSocialApp,
} from '../composition/wiring.js'

export interface CollabPluginDeps {
  db: Queryable
  publish: (userId: string, payload: unknown) => void
  publishMany: (userIds: readonly string[], payload: unknown) => void
  clock?: () => Date
  genId?: (prefix: string) => string
}

/**
 * Collaboration BC 已迁移路由（组 'collab'）：邀请 / 待处理 / 响应 / 自动规则 / 退出。
 *   POST   /api/tasks/:id/invite     {userId, force?}
 *   GET    /api/invites
 *   POST   /api/invites/:id/respond  {accept|follow, remind?}
 *   GET    /api/auto-rules
 *   DELETE /api/auto-rules/:id
 *   POST   /api/tasks/:id/leave
 *
 * collab↔friends 循环消除：好友判定/请求经 FriendCircle 端口委托给 SocialApp（collab 单向依赖 social）。
 * 通知/聊天注入/事件/活动/任务读写经组合根 wiring 的原始 SQL 适配器 1:1 复刻现网副作用。
 */
export function makeCollabPlugin(deps: CollabPluginDeps): MigratedPlugin {
  const { db, publish, publishMany } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((p: string): string => makePrefixedId(p)())
  const { nowIso, nowIsoMs } = makeClocks(clock)
  const events = makeEventBus(publish, publishMany)

  const appFor = (userId: string): ReturnType<typeof makeCollabApp> => {
    const social = buildSocialApp({ db, publish, nowIso, genId, clock })
    return makeCollabApp({
      collaborators: makeCollaboratorRepo({ db, userId, clock, genId }),
      autoRules: makeAutoRuleRepo({ db, userId, clock, genId }),
      activity: makeActivityGateway(db, userId, { nowIso, genId }),
      tasks: makeTaskGateway(db, userId, { nowIso }),
      users: makeUserDirectory(db),
      friends: makeFriendCircle(social),
      notifier: makeNotifierForUser(db, publish, userId, { nowIso, genId }),
      chat: makeChatInjector(db, publish, { nowIso, nowIsoMs, genId }),
      events,
    })
  }

  const actor = (
    req: FastifyRequest,
    reply: FastifyReply,
  ): { id: string; name: string } | undefined => {
    const u = req.user
    if (!u) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return { id: u.id, name: u.name }
  }

  return {
    group: 'collab',
    register: async (app) => {
      app.post('/api/tasks/:id/invite', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const b = (req.body ?? {}) as { userId?: unknown; force?: unknown }
        const r = await appFor(me.id).invite(me, (req.params as { id: string }).id, String(b.userId ?? ''), {
          force: !!b.force,
        })
        if ('error' in r) {
          const status = r.needConfirm ? 409 : r.cooldown ? 429 : r.notFriend ? 403 : r.bad ? 400 : 404
          return reply
            .status(status)
            .send({ error: r.error, needConfirm: !!r.needConfirm, notFriend: !!r.notFriend })
        }
        return r
      })

      app.get('/api/invites', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const repo = makeCollaboratorRepo({ db, userId: me.id, clock, genId })
        return { invites: await repo.myPending() }
      })

      app.post('/api/invites/:id/respond', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const b = (req.body ?? {}) as { follow?: unknown; accept?: unknown; remind?: unknown }
        const mode: RespondMode = b.follow ? 'follow' : b.accept ? 'accept' : 'decline'
        const remind = 'remind' in b ? !!b.remind : true
        const r = await appFor(me.id).respondInvite(me, (req.params as { id: string }).id, mode, remind)
        if (!r) return reply.status(404).send({ error: '邀请不存在或已处理' })
        return r
      })

      app.get('/api/auto-rules', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        // 承 legacy autoRules.all 投影：不含 userId（内部字段），与现网线上响应逐字段一致。
        const rules = (await makeAutoRuleRepo({ db, userId: me.id, clock, genId }).all()).map(
          ({ userId: _u, ...r }) => r,
        )
        return { rules }
      })

      app.delete('/api/auto-rules/:id', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        await makeAutoRuleRepo({ db, userId: me.id, clock, genId }).remove((req.params as { id: string }).id)
        return { ok: true }
      })

      app.post('/api/tasks/:id/leave', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const taskId = (req.params as { id: string }).id
        const tg = makeTaskGateway(db, me.id, { nowIso })
        const acc = await tg.access(taskId)
        const task = await tg.get(taskId)
        if (!task || acc === null) return reply.status(404).send({ error: 'task not found' })
        const repo = makeCollaboratorRepo({ db, userId: me.id, clock, genId })
        if (!(await repo.leave(taskId))) {
          return reply.status(400).send({ error: '你不是该任务的协作者' })
        }
        // 通知 owner：退出协作（承 legacy 内联 INSERT，全 ISO 时间戳，且【不 publish】）。
        const ownerRow = (
          await db.execute<{ user_id: string }>('SELECT user_id FROM tasks WHERE id = $1', [taskId])
        )[0]
        if (ownerRow) {
          const meName = me.name || '协作者'
          await db.execute(
            `INSERT INTO notifications (id,user_id,type,icon,color,text,read,created_at) VALUES ($1,$2,$3,$4,$5,$6,0,$7)`,
            [
              genId('nt'),
              ownerRow.user_id,
              'assign',
              'ph-sign-out',
              'var(--text3)',
              `${meName} 退出了「${task.title}」的协作`,
              clock().toISOString(),
            ],
          )
        }
        return { ok: true }
      })
    },
  }
}
