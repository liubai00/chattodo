import type { FastifyReply, FastifyRequest } from 'fastify'
import { makePrefixedId } from '@linx/kernel-ids'
import { makeFriendshipRepo, type Queryable } from '@linx/infra-social-pg'
import { makeSocialApp, type SocialApp, type SocialNotification } from '@linx/app-social'
import { createMemoryRateLimiter, type RateLimiter } from '@linx/platform-ratelimit'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface SocialPluginDeps {
  db: Queryable
  /** eventbus 扇出（承接现网 services/events.js publish）；注入以便测试观测。 */
  publish: (userId: string, payload: unknown) => void
  /** 好友请求限流器；省略则用进程内 15/60s（1:1 承接 lib/rateLimit.js）。 */
  friendReqLimiter?: RateLimiter
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Social BC 已迁移路由（组 'social'）：好友总览/请求/响应/解除 + 选人目录 /api/team。
 *   GET    /api/friends
 *   POST   /api/friends/request      {email}
 *   POST   /api/friends/:id/respond  {accept}
 *   DELETE /api/friends/:id
 *   GET    /api/team
 *
 * 跨界副作用（写 notifications、发 eventbus、读 app_settings.friend_policy、查 users）在此 composition-root
 * 适配器层用原始 SQL 忠实复刻现网 pushNotification / publish / friends.js；等 notification/settings/identity BC
 * 迁移后再换成各自 app 端口。全部 5 条路由的副作用均可复刻，故整组权威（不留 fall-through）。
 */
export function makeSocialPlugin(deps: SocialPluginDeps): MigratedPlugin {
  const { db, publish } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const friendReqLimiter =
    deps.friendReqLimiter ?? createMemoryRateLimiter({ limit: 15, windowMs: 60_000 })

  const social: SocialApp = makeSocialApp({
    friendships: makeFriendshipRepo({ db, clock, genId }),
    users: {
      async byId(id) {
        const rows = await db.execute<{ id: string; name: string | null; email: string | null }>(
          'SELECT id, name, email FROM users WHERE id = $1',
          [id],
        )
        const u = rows[0]
        return u ? { id: u.id, name: u.name ?? '', email: u.email ?? '' } : undefined
      },
      async byEmailLower(emailLower) {
        const rows = await db.execute<{ id: string }>(
          'SELECT id FROM users WHERE lower(email) = $1',
          [emailLower],
        )
        return rows[0] ? { id: rows[0].id } : undefined
      },
    },
    notifier: {
      // 1:1 承接 collab.pushNotification：INSERT notifications + publish {kind:'notify'}
      async push(userId: string, n: SocialNotification) {
        await db.execute(
          `INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,0,$9)`,
          [
            genId('nt'),
            userId,
            n.type || 'assign',
            n.icon || 'ph-user-switch',
            n.color || 'var(--accent-ink)',
            n.text,
            n.actionType ?? null,
            n.actionRef ?? null,
            nowIso(),
          ],
        )
        publish(userId, { kind: 'notify', text: n.text, actionType: n.actionType ?? null })
      },
      async markHandledFor(actionRef: string, userId: string) {
        await db.execute(
          'UPDATE notifications SET handled = 1, read = 1 WHERE action_ref = $1 AND user_id = $2',
          [actionRef, userId],
        )
      },
      async markHandled(actionRef: string) {
        await db.execute('UPDATE notifications SET handled = 1 WHERE action_ref = $1', [actionRef])
      },
    },
    publishFriends: (userId: string) => publish(userId, { kind: 'friends' }),
    friendPolicyClosed: async (userId: string) => {
      const rows = await db.execute<{ friend_policy: string | null }>(
        'SELECT friend_policy FROM app_settings WHERE user_id = $1',
        [userId],
      )
      return rows[0]?.friend_policy === 'closed'
    },
  })

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
    group: 'social',
    register: async (app) => {
      app.get('/api/friends', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        return social.overview(me.id)
      })

      app.post('/api/friends/request', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const hit = await friendReqLimiter.hit('friendreq:' + me.id)
        if (!hit.allowed) {
          return reply.status(429).send({ error: '好友请求发送太频繁，稍后再试' })
        }
        const email = (req.body as { email?: unknown } | undefined)?.email
        const r = await social.requestByEmail(me, String(email ?? ''))
        if ('error' in r) {
          const status = r.code === 'not_found' ? 404 : r.code === 'closed' ? 403 : 400
          return reply.status(status).send({ error: r.error })
        }
        return r
      })

      app.post('/api/friends/:id/respond', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const accept = !!(req.body as { accept?: unknown } | undefined)?.accept
        const r = await social.respond(me, (req.params as { id: string }).id, accept)
        if (!r) return reply.status(404).send({ error: '请求不存在或已处理' })
        return r
      })

      app.delete('/api/friends/:id', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const r = await social.remove(me, (req.params as { id: string }).id)
        if (!r) return reply.status(404).send({ error: '关系不存在或无权操作' })
        return r
      })

      // 选人目录：仅「自己 + 已接受好友」，普通成员不能枚举注册用户（现网 team.js 收口）。
      app.get('/api/team', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const ids = [me.id, ...(await social.friendIds(me.id))]
        const marks = ids.map((_v, i) => `$${i + 1}`).join(',')
        const users = await db.execute<{
          id: string
          name: string | null
          email: string | null
          role: string | null
          created_at: string | null
        }>(
          `SELECT id, name, email, role, created_at FROM users WHERE id IN (${marks}) ORDER BY created_at`,
          ids,
        )
        return {
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            createdAt: u.created_at,
          })),
        }
      })
    },
  }
}
