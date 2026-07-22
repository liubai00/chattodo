import type { FastifyReply, FastifyRequest } from 'fastify'
import type { TaskDatabaseActor, TaskSpace } from '@linx/domain-task-database'
import {
  type BaserowClient,
  type BaserowControlStore,
  requestSignature,
  safeHexEqual,
  sha256,
} from '@linx/infra-baserow'
import type { MigratedPlugin } from '../facade/build-api.js'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
}

export interface BaserowPluginDeps {
  db: {
    execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
  }
  control: BaserowControlStore
  client: BaserowClient
  sharedSecret: string
  publicUrl: string
  linxPublicUrl: string
  publish: (userId: string, payload: unknown) => void
  clock?: () => Date
}

interface TaskAssignedEvent {
  type: 'task.assigned'
  eventId: string
  recipients: string[]
  actorName: string
  task: { ref: string; title: string }
}

const TASK_REF_PATTERN = /^brw:(team|personal):[1-9]\d*:[1-9]\d*$/

function parseTaskAssignedEvent(value: unknown): TaskAssignedEvent | undefined {
  if (!value || typeof value !== 'object') return undefined
  const event = value as Record<string, unknown>
  const task = event.task && typeof event.task === 'object'
    ? event.task as Record<string, unknown>
    : undefined
  if (
    event.type !== 'task.assigned' ||
    typeof event.eventId !== 'string' ||
    !/^[a-z0-9_-]{8,128}$/i.test(event.eventId) ||
    !Array.isArray(event.recipients) ||
    event.recipients.length === 0 ||
    event.recipients.length > 50 ||
    typeof event.actorName !== 'string' ||
    event.actorName.trim().length === 0 ||
    event.actorName.length > 150 ||
    !task ||
    typeof task.ref !== 'string' ||
    !TASK_REF_PATTERN.test(task.ref) ||
    typeof task.title !== 'string' ||
    task.title.length > 500
  ) return undefined
  const recipients = [...new Set(event.recipients)]
  if (recipients.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128)) return undefined
  return {
    type: 'task.assigned',
    eventId: event.eventId,
    recipients,
    actorName: event.actorName.trim(),
    task: { ref: task.ref, title: task.title.trim() || '未命名任务' },
  }
}

function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name]
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

function actorOf(request: FastifyRequest): TaskDatabaseActor | undefined {
  const user = request.user
  return user
    ? { id: user.id, name: user.name, email: user.email, role: user.role }
    : undefined
}

export function makeBaserowPlugin(deps: BaserowPluginDeps): MigratedPlugin {
  const clock = deps.clock ?? (() => new Date())

  const requireActor = (request: FastifyRequest, reply: FastifyReply): TaskDatabaseActor | undefined => {
    const actor = actorOf(request)
    if (!actor) void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
    return actor
  }

  const verifyInternalRequest = async (request: FastifyRequest, path: string): Promise<boolean> => {
    const timestamp = header(request, 'x-linx-timestamp')
    const nonce = header(request, 'x-linx-nonce')
    const signature = header(request, 'x-linx-signature')
    const unixSeconds = Number(timestamp)
    if (!Number.isFinite(unixSeconds) || Math.abs(Math.floor(clock().getTime() / 1000) - unixSeconds) > 60) return false
    const expected = requestSignature(deps.sharedSecret, {
      method: request.method,
      path,
      timestamp,
      nonce,
      body: request.body,
    })
    if (!safeHexEqual(signature, expected)) return false
    return deps.control.rememberNonce(nonce)
  }

  return {
    group: 'baserow',
    register: async (app) => {
      app.get('/api/baserow/status', async (request, reply) => {
        if (!requireActor(request, reply)) return
        return { enabled: true, healthy: await deps.client.health(), publicUrl: deps.publicUrl }
      })

      app.post('/api/baserow/session', async (request, reply) => {
        const actor = requireActor(request, reply)
        if (!actor) return
        const body = (request.body ?? {}) as { space?: unknown }
        const space: TaskSpace = body.space === 'personal' ? 'personal' : 'team'
        const { ticket, expiresAt } = await deps.control.createLaunchTicket(actor.id, space)
        const launch = new URL('/linx/session', deps.publicUrl)
        launch.searchParams.set('ticket', ticket)
        launch.searchParams.set('space', space)
        return { launchUrl: launch.toString(), expiresAt, space }
      })

      app.post('/api/baserow/actions', async (request, reply) => {
        const actor = requireActor(request, reply)
        if (!actor) return
        const body = (request.body ?? {}) as { action?: unknown }
        if (!body.action || typeof body.action !== 'object') {
          return reply.status(400).send({ error: 'action is required', code: 'INVALID_ACTION' })
        }
        return { result: await deps.client.action(actor, body.action as Record<string, unknown>) }
      })

      app.post('/api/admin/baserow/invitations', async (request, reply) => {
        const actor = requireActor(request, reply)
        if (!actor) return
        if (actor.role !== 'admin') return reply.status(403).send({ error: '仅管理员可创建邀请链接' })
        const invite = await deps.control.createInvite(actor.id)
        const url = new URL(deps.linxPublicUrl)
        url.hash = `/chat?invite=${encodeURIComponent(invite.token)}`
        return { url: url.toString(), expiresAt: invite.expiresAt }
      })

      app.get('/api/admin/baserow/invitations', async (request, reply) => {
        const actor = requireActor(request, reply)
        if (!actor) return
        if (actor.role !== 'admin') return reply.status(403).send({ error: '仅管理员可查看邀请链接' })
        return { invitations: await deps.control.listInvites() }
      })

      // Baserow 插件服务端调用。该路径不接受 LinX Bearer 会话，只接受 60 秒 HMAC + 一次性 nonce。
      app.post('/api/internal/baserow/exchange', async (request, reply) => {
        if (!(await verifyInternalRequest(request, '/api/internal/baserow/exchange'))) {
          return reply.status(401).send({ error: 'invalid service signature', code: 'INVALID_SIGNATURE' })
        }
        const body = (request.body ?? {}) as { ticket?: unknown }
        const consumed = await deps.control.consumeLaunchTicket(String(body.ticket ?? ''))
        if (!consumed) return reply.status(410).send({ error: 'ticket expired or already used', code: 'INVALID_TICKET' })
        const user = (
          await deps.db.execute<UserRow>('SELECT id,name,email,role FROM users WHERE id = $1', [consumed.userId])
        )[0]
        if (!user) return reply.status(404).send({ error: 'user not found', code: 'USER_NOT_FOUND' })
        return {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          teamKey: 'linx-default-team',
          targetSpace: consumed.targetSpace,
        }
      })

      // Baserow 原生表格与 AI 网关共用此事件出口，避免两条路径各自发送重复通知。
      app.post('/api/internal/baserow/events', async (request, reply) => {
        if (!(await verifyInternalRequest(request, '/api/internal/baserow/events'))) {
          return reply.status(401).send({ error: 'invalid service signature', code: 'INVALID_SIGNATURE' })
        }
        const event = parseTaskAssignedEvent(request.body)
        if (!event) {
          return reply.status(400).send({ error: 'invalid Baserow event', code: 'INVALID_EVENT' })
        }
        const text = `${event.actorName} 把「${event.task.title}」指派给你`
        const createdAt = clock().toISOString()
        let created = 0
        for (const recipient of event.recipients) {
          const user = await deps.db.execute<{ id: string }>('SELECT id FROM users WHERE id = $1', [recipient])
          if (!user[0]) continue
          const id = `nt_brw_${sha256(`${event.eventId}:${recipient}`).slice(0, 40)}`
          const inserted = await deps.db.execute<{ id: string }>(
            `INSERT INTO notifications
              (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at)
             VALUES ($1,$2,'assign','ph-user-switch','var(--accent-ink)',$3,0,'task',$4,0,$5)
             ON CONFLICT (id) DO NOTHING RETURNING id`,
            [id, recipient, text, event.task.ref, createdAt],
          )
          if (!inserted[0]) continue
          created += 1
          deps.publish(recipient, { kind: 'notify', text, actionType: 'task' })
        }
        return { ok: true, created }
      })
    },
  }
}
