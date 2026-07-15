// 组合根适配器（composition root）：把 legacy 共享表（notifications / users / app_settings /
// chat_messages / conversations / tasks）的原始副作用，1:1 复刻为各 app 端口的实现。
// 这里是 Strangler 期唯一允许跨 BC 表直接读写的层；待各 BC 迁移后逐个替换为其 app 端口。
import { makePrefixedId } from '@linx/kernel-ids'
import { makeFriendshipRepo, type Queryable } from '@linx/infra-social-pg'
import { makeSocialApp, type SocialApp, type SocialNotification } from '@linx/app-social'
import type {
  ActivityGateway,
  ChatInjector,
  CollabNotifier,
  EventBus,
  FriendCircle,
  FriendCircleResult,
  TaskGateway,
  UserDirectory,
} from '@linx/app-collab'

const pad = (n: number): string => String(n).padStart(2, '0')

export interface WiringBase {
  db: Queryable
  clock?: () => Date
  genId?: (prefix: string) => string
}

export function makeClocks(clock: () => Date): { nowIso: () => string; nowIsoMs: () => string } {
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const nowIsoMs = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
  return { nowIso, nowIsoMs }
}

const gen =
  (genId?: (p: string) => string) =>
  (prefix: string): string =>
    genId ? genId(prefix) : makePrefixedId(prefix)()

/** users 目录（byId 含 email 以满足 social.FriendParty；byName / byEmailLower）。 */
export function makeUserDirectory(db: Queryable): UserDirectory & {
  byId(id: string): Promise<{ id: string; name: string; email: string } | undefined>
  byEmailLower(emailLower: string): Promise<{ id: string } | undefined>
} {
  return {
    async byId(id) {
      const r = (
        await db.execute<{ id: string; name: string | null; email: string | null }>(
          'SELECT id, name, email FROM users WHERE id = $1',
          [id],
        )
      )[0]
      return r ? { id: r.id, name: r.name ?? '', email: r.email ?? '' } : undefined
    },
    async byName(name) {
      const r = (
        await db.execute<{ id: string; name: string | null }>('SELECT id, name FROM users WHERE name = $1', [
          String(name || '').trim(),
        ])
      )[0]
      return r ? { id: r.id, name: r.name ?? '' } : undefined
    },
    async byEmailLower(emailLower) {
      const r = (await db.execute<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [emailLower]))[0]
      return r ? { id: r.id } : undefined
    },
  }
}

/** app_settings.friend_policy === 'closed'。 */
export function makeFriendPolicyClosed(db: Queryable): (userId: string) => Promise<boolean> {
  return async (userId) => {
    const r = (
      await db.execute<{ friend_policy: string | null }>(
        'SELECT friend_policy FROM app_settings WHERE user_id = $1',
        [userId],
      )
    )[0]
    return r?.friend_policy === 'closed'
  }
}

/**
 * notifications 适配器（承 collab.pushNotification + notifications.markHandled*）。
 * push 内含 publish {kind:'notify'}；markHandled* 按 action_ref（+可选 user_id）批处理。
 */
export function makeNotifier(
  db: Queryable,
  publish: (userId: string, payload: unknown) => void,
  opts: { nowIso: () => string; genId: (p: string) => string },
): CollabNotifier & {
  markHandledFor(actionRef: string, userId: string): Promise<void>
  markHandled(actionRef: string): Promise<void>
} {
  const pushRow = async (userId: string, n: SocialNotification | { text: string } & Partial<SocialNotification>) => {
    await db.execute(
      `INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,0,$9)`,
      [
        opts.genId('nt'),
        userId,
        n.type || 'assign',
        n.icon || 'ph-user-switch',
        n.color || 'var(--accent-ink)',
        n.text,
        n.actionType ?? null,
        n.actionRef ?? null,
        opts.nowIso(),
      ],
    )
    publish(userId, { kind: 'notify', text: n.text, actionType: n.actionType ?? null })
  }
  return {
    push: pushRow,
    // respond（好友）：我这边的请求通知置已处理 + 已读
    async markHandledFor(actionRef, userId) {
      await db.execute('UPDATE notifications SET handled = 1, read = 1 WHERE action_ref = $1 AND user_id = $2', [
        actionRef,
        userId,
      ])
    },
    // remove（好友）：关系相关通知全部置已处理
    async markHandled(actionRef) {
      await db.execute('UPDATE notifications SET handled = 1 WHERE action_ref = $1', [actionRef])
    },
    // respondInvite（协作）：按 action_ref 且限 acting user 置已处理 + 已读
    async markHandledByRef(_actionRef) {
      // 由 makeNotifierForUser 覆盖以绑定 userId；此基座实现不应被直接调用。
      throw new Error('markHandledByRef requires a user-bound notifier')
    },
  }
}

/** 绑定 acting user 的 notifier（markHandledByRef 需 user 作用域，承 notifications.markHandledByRef）。 */
export function makeNotifierForUser(
  db: Queryable,
  publish: (userId: string, payload: unknown) => void,
  userId: string,
  opts: { nowIso: () => string; genId: (p: string) => string },
): CollabNotifier {
  const base = makeNotifier(db, publish, opts)
  return {
    push: base.push,
    async markHandledByRef(actionRef) {
      await db.execute('UPDATE notifications SET handled = 1, read = 1 WHERE user_id = $1 AND action_ref = $2', [
        userId,
        actionRef,
      ])
    },
  }
}

/** pushChat：向对方默认会话注入 agent 消息 + 触碰会话 updated_at + publish {kind:'chat'}。 */
export function makeChatInjector(
  db: Queryable,
  publish: (userId: string, payload: unknown) => void,
  opts: { nowIso: () => string; nowIsoMs: () => string; genId: (p: string) => string },
): ChatInjector {
  return {
    async inject(userId, text) {
      const conv = 'conv_' + userId
      await db.execute(
        `INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ($1,$2,$3,'agent',$4,0,$5)`,
        [opts.genId('msg'), userId, conv, text, opts.nowIso()],
      )
      await db.execute('UPDATE conversations SET updated_at = $1 WHERE id = $2', [opts.nowIsoMs(), conv])
      publish(userId, { kind: 'chat' })
    },
  }
}

/** activity.log（承 repositories.activity.log，绑定 acting user）。 */
export function makeActivityGateway(
  db: Queryable,
  userId: string,
  opts: { nowIso: () => string; genId: (p: string) => string },
): ActivityGateway {
  return {
    async log(taskId, text) {
      const id = opts.genId('act')
      await db.execute('INSERT INTO activity (id,user_id,task_id,text,created_at) VALUES ($1,$2,$3,$4,$5)', [
        id,
        userId,
        taskId,
        text,
        opts.nowIso(),
      ])
      return id
    },
  }
}

type TaskRow = {
  id: string
  title: string
  notes: string | null
  status: string
  project_id: string | null
  tags: string | null
  context: string | null
  due_at: string | null
  planned_at: string | null
  duration_minutes: number | null
  priority: number | null
  privacy_scope: string | null
  source_idea_id: string | null
  assignee: string | null
  created_at: string | null
  updated_at: string | null
}

// 承 legacy toTask（repositories/index.js:6）：完整 16 字段，tags 反序列化，privacy_scope 原样不强制。
function rowToFullTask(r: TaskRow): Record<string, unknown> {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    status: r.status,
    projectId: r.project_id,
    tags: JSON.parse(r.tags || '[]'),
    context: r.context,
    dueAt: r.due_at,
    plannedAt: r.planned_at,
    durationMinutes: r.duration_minutes,
    priority: r.priority,
    privacyScope: r.privacy_scope,
    sourceIdeaId: r.source_idea_id,
    assignee: r.assignee || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * TaskGateway：get 为【无门禁】原始读，但返回【完整 toTask 形状】（承 collab.js 响应里 repos.tasks.get 的
 * 16 字段实体，供 respondInvite 的接受返回体与 settle 的 taskEntity 保真）；access/update 按 owner 门禁
 * （承 repos.tasks.update：assignee 仅 owner 可改；非 owner 更新返回 undefined，不误报成功）。
 */
export function makeTaskGateway(
  db: Queryable,
  userId: string,
  opts: { nowIso: () => string },
): TaskGateway {
  const access = async (id: string): Promise<'owner' | 'collaborator' | null> => {
    const r = (await db.execute<{ user_id: string }>('SELECT user_id FROM tasks WHERE id = $1', [id]))[0]
    if (!r) return null
    if (r.user_id === userId) return 'owner'
    const c = (
      await db.execute(
        `SELECT 1 FROM task_collaborators WHERE task_id = $1 AND user_id = $2 AND status = 'accepted'`,
        [id, userId],
      )
    )[0]
    return c ? 'collaborator' : null
  }
  const get = async (id: string) => {
    const r = (await db.execute<TaskRow>('SELECT * FROM tasks WHERE id = $1', [id]))[0]
    return r ? (rowToFullTask(r) as { id: string; title: string }) : undefined
  }
  return {
    get,
    access,
    async update(id, patch) {
      if ((await access(id)) !== 'owner') return undefined
      if (patch.assignee !== undefined) {
        await db.execute('UPDATE tasks SET assignee = $1, updated_at = $2 WHERE id = $3', [
          patch.assignee,
          opts.nowIso(),
          id,
        ])
      }
      return get(id)
    },
  }
}

/** eventbus 端口（publish / publishMany）。 */
export function makeEventBus(
  publish: (userId: string, payload: unknown) => void,
  publishMany: (userIds: readonly string[], payload: unknown) => void,
): EventBus {
  return { publish, publishMany }
}

/** 组装 SocialApp（供 friends 端口复用；打破 collab↔social 循环 = collab 单向依赖 social）。 */
export function buildSocialApp(deps: {
  db: Queryable
  publish: (userId: string, payload: unknown) => void
  nowIso: () => string
  genId: (p: string) => string
  clock: () => Date
}): SocialApp {
  const { db, publish, nowIso, genId, clock } = deps
  const users = makeUserDirectory(db)
  const notifier = makeNotifier(db, publish, { nowIso, genId })
  return makeSocialApp({
    friendships: makeFriendshipRepo({ db, clock, genId }),
    users: { byId: users.byId, byEmailLower: users.byEmailLower },
    notifier: {
      push: notifier.push,
      markHandledFor: notifier.markHandledFor,
      markHandled: notifier.markHandled,
    },
    publishFriends: (userId) => publish(userId, { kind: 'friends' }),
    friendPolicyClosed: makeFriendPolicyClosed(db),
  })
}

/** FriendCircle 端口（collab 用）：isFriend + requestById，委托给 SocialApp 并投影为 collab 只读的字段。 */
export function makeFriendCircle(social: SocialApp): FriendCircle {
  return {
    isFriend: (a, b) => social.isFriend(a, b),
    async requestById(user, targetId) {
      const r = await social.requestById(user, targetId)
      // 投影：collab settle 仅读 autoAccepted / friendship / pending / error（already 态在此路径不可达）。
      const out: FriendCircleResult = {}
      if ('error' in r) out.error = r.error
      if ('friendship' in r) out.friendship = r.friendship
      if ('autoAccepted' in r && r.autoAccepted) out.autoAccepted = true
      if ('pending' in r && r.pending) out.pending = true
      return out
    },
  }
}
