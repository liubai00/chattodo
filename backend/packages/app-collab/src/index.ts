// @linx/app-collab — 协作用例编排（忠实承接 server/src/services/collab.js）。
// 与 friends 的循环依赖在此消除：好友判定/请求经 FriendCircle 端口注入（由 app-social 提供），
// collab 不反向依赖 social。通知/聊天注入/事件/用户目录/任务查询同样经端口注入。
import {
  decisionOf,
  parseAutoRule,
  rawMentionNames,
  type AutoRule,
  type Collaborator,
  type Mention,
  type RespondMode,
} from '@linx/domain-collab'

// —— 注入端口 ——
export interface CollabActor {
  id: string
  name?: string
}

/** 任务查询/更新（domain-tasks 的最小视图）。 */
export interface TaskLike {
  id: string
  title: string
  dueAt?: string | null
  privacyScope?: string
  assignee?: string | null
  [k: string]: unknown
}
export interface TaskGateway {
  get(id: string): Promise<TaskLike | undefined>
  access(id: string): Promise<'owner' | 'collaborator' | null>
  update(id: string, patch: { assignee?: string }): Promise<TaskLike | undefined>
}

export interface CollabNotification {
  type?: string
  icon?: string
  color?: string
  text: string
  actionType?: string
  actionRef?: string
}
export interface CollabNotifier {
  push(userId: string, n: CollabNotification): Promise<void>
  /** 把某关系相关的请求通知置已处理 + 已读（承 notifications.markHandledByRef）。 */
  markHandledByRef(actionRef: string): Promise<void>
}

export interface ChatInjector {
  /** 向对方默认会话注入一条 agent 消息（承 collab.pushChat）。 */
  inject(userId: string, text: string): Promise<void>
}

export interface EventBus {
  publish(userId: string, payload: unknown): void
  publishMany(userIds: readonly string[], payload: unknown): void
}

export interface UserDirectory {
  byId(id: string): Promise<{ id: string; name: string } | undefined>
  byName(name: string): Promise<{ id: string; name: string } | undefined>
}

/** 好友圈端口（app-social 提供；打破 collab↔friends 循环）。 */
export interface FriendCircleResult {
  autoAccepted?: boolean
  friendship?: unknown
  pending?: boolean
  error?: string
}
export interface FriendCircle {
  isFriend(a: string, b: string): Promise<boolean>
  requestById(user: CollabActor, targetId: string): Promise<FriendCircleResult>
}

/** 协作仓储端口（infra-collab-pg 提供）。 */
export interface CollaboratorGateway {
  invite(taskId: string, targetUserId: string): Promise<{ collab: Collaborator; reused: boolean } | null>
  get(id: string): Promise<Collaborator | undefined>
  respond(id: string, decision: Collaborator['status'], remind: boolean): Promise<Collaborator | undefined>
  watchersOf(taskId: string): Promise<string[]>
}
export interface AutoRuleGateway {
  all(): Promise<AutoRule[]>
  create(keyword: string, targetId: string, targetName: string): Promise<AutoRule>
}
export interface ActivityGateway {
  /** 以当前 acting user 记一条任务动态（承 activity.log）。 */
  log(taskId: string, text: string): Promise<string>
}

export interface CollabAppDeps {
  collaborators: CollaboratorGateway
  autoRules: AutoRuleGateway
  activity: ActivityGateway
  tasks: TaskGateway
  users: UserDirectory
  friends: FriendCircle
  notifier: CollabNotifier
  chat: ChatInjector
  events: EventBus
}

// —— 结果类型 ——
export interface InviteOk {
  collab: Collaborator
  reused: boolean
  userName: string
}
export interface InviteErr {
  error: string
  bad?: boolean
  notFriend?: boolean
  targetId?: string
  targetName?: string
  needConfirm?: boolean
  cooldown?: boolean
}
export type InviteResult = InviteOk | InviteErr

export interface PerformedInvite {
  type: 'invite'
  userId: string
  userName: string
  collabId: string
  auto?: boolean
  rule?: string
  recovered?: boolean
}
export interface PerformedFriendReq {
  type: 'friend_request'
  userId: string
  userName: string
  auto?: boolean
}
export type Performed = PerformedInvite | PerformedFriendReq

const pad = (n: number): string => String(n).padStart(2, '0')
const fmtDue = (iso: string | null | undefined): string => {
  if (!iso) return '待定'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function makeCollabApp(deps: CollabAppDeps) {
  const { collaborators, autoRules, activity, tasks, users, friends, notifier, chat, events } = deps

  // 发出协作邀请（owner 视角）。承 inviteFx。
  async function invite(
    user: CollabActor | null,
    taskId: string,
    targetUserId: string,
    opts: { force?: boolean } = {},
  ): Promise<InviteResult> {
    const force = opts.force ?? false
    const task = await tasks.get(taskId)
    if (!task || (await tasks.access(taskId)) !== 'owner') return { error: '任务不存在或无权邀请' }
    const target = await users.byId(targetUserId)
    if (!target) return { error: '成员不存在' }
    if (user && target.id === user.id) return { error: '不能邀请自己', bad: true }
    // 好友圈收口：只能邀请已接受的好友（user 缺省 = 单用户/测试，跳过）
    if (user && !(await friends.isFriend(user.id, target.id))) {
      return { error: `你和 ${target.name} 还不是好友，先添加好友后才能邀请协作`, notFriend: true, targetId: target.id, targetName: target.name }
    }
    if (task.privacyScope === 'personal' && !force) {
      return { error: '这是「个人」范围的任务，确认要邀请他人协作吗？', needConfirm: true }
    }
    const r = await collaborators.invite(taskId, target.id)
    if (!r) return { error: '对方 24 小时内拒绝过该邀请，先线下沟通一下吧', cooldown: true }
    if (!r.reused) {
      const meName = (user && user.name) || '有人'
      await activity.log(taskId, `邀请 ${target.name} 协作`)
      await notifier.push(target.id, {
        icon: 'ph-user-plus',
        text: `${meName} 邀请你协作「${task.title}」（截止 ${fmtDue(task.dueAt)}）`,
        actionType: 'invite',
        actionRef: r.collab.id,
      })
      await chat.inject(
        target.id,
        `${meName} 邀请你协作「${task.title}」（截止 ${fmtDue(task.dueAt)}）。\n回复「接受」列入你的任务并开启到期提醒，回复「拒绝」忽略；也可以在通知中心处理。`,
      )
    }
    return { collab: r.collab, reused: r.reused, userName: target.name }
  }

  // 响应邀请（被邀请人视角）。承 respondInviteFx。
  async function respondInvite(
    user: CollabActor | null,
    inviteId: string,
    mode: RespondMode | boolean,
    remind = true,
  ): Promise<{ collab: Collaborator; taskTitle: string; task: TaskLike | null } | null> {
    const m: RespondMode = mode === true ? 'accept' : mode === false ? 'decline' : mode
    const decision = decisionOf(m)
    const before = await collaborators.get(inviteId)
    const updated = await collaborators.respond(inviteId, decision, remind)
    if (!updated || !before) return null
    await notifier.markHandledByRef(updated.id)
    const meName = (user && user.name) || '对方'
    const task = await tasks.get(updated.taskId)
    const title = task ? task.title : ''
    await notifier.push(before.invitedBy, {
      icon: decision === 'declined' ? 'ph-x-circle' : decision === 'following' ? 'ph-eye' : 'ph-check-circle',
      color: decision === 'declined' ? 'var(--danger)' : 'var(--accent)',
      text:
        decision === 'accepted'
          ? `${meName} 接受了「${title}」的协作邀请`
          : decision === 'following'
            ? `${meName} 开始关注「${title}」（不参与执行，接收进展通知）`
            : `${meName} 婉拒了「${title}」的协作邀请`,
    })
    if (decision !== 'declined') {
      await activity.log(updated.taskId, decision === 'accepted' ? `${meName} 加入协作` : `${meName} 开始关注`)
    }
    if (decision !== 'accepted') return { collab: updated, taskTitle: title, task: null }
    const owner = await users.byId(updated.ownerId)
    const fullTask = await tasks.get(updated.taskId)
    return {
      collab: updated,
      taskTitle: title,
      task: fullTask ? { ...fullTask, collabFrom: (owner && owner.name) || '', collabRemind: remind } : null,
    }
  }

  // 共享任务完成 → 通知 owner + 协作者 + 关注者（排除操作者本人）。承 notifyTaskDoneFx。
  async function notifyTaskDone(user: CollabActor | null, taskId: string): Promise<void> {
    const task = await tasks.get(taskId)
    if (!task) return
    const watchers = (await collaborators.watchersOf(taskId)).filter((uid) => !user || uid !== user.id)
    if (!watchers.length) return
    const meName = (user && user.name) || '有人'
    for (const uid of new Set(watchers)) {
      await notifier.push(uid, { type: 'done', icon: 'ph-check-circle', color: 'var(--accent)', text: `${meName} 完成了「${task.title}」` })
    }
    events.publishMany(watchers, { kind: 'task', taskId })
  }

  // 记忆里的自动化规则 → 建 auto_rule。承 maybeCreateAutoRule。
  async function maybeCreateAutoRule(note: string, user: CollabActor | null): Promise<AutoRule | null> {
    const parsed = parseAutoRule(note)
    if (!parsed) return null
    const target = await users.byName(parsed.name)
    if (!parsed.keyword || !target) return null
    if (user && !(await friends.isFriend(user.id, target.id))) return null
    const exists = (await autoRules.all()).some((r) => r.keyword === parsed.keyword && r.targetId === target.id)
    if (exists) return null
    return autoRules.create(parsed.keyword, target.id, target.name)
  }

  // 新任务命中自动规则 → 自动发出协作邀请。承 applyAutoInvitesFx。
  async function applyAutoInvites(
    user: CollabActor | null,
    task: { id: string; title: string },
    rawText: string,
  ): Promise<Performed[]> {
    const performed: Performed[] = []
    const hay = `${task.title} ${rawText || ''}`
    for (const rule of await autoRules.all()) {
      if (rule.action !== 'invite' || !rule.keyword) continue
      if (!hay.includes(rule.keyword)) continue
      if (user && rule.targetId === user.id) continue
      const r = await invite(user, task.id, rule.targetId)
      if ('collab' in r && !r.reused) {
        performed.push({ type: 'invite', auto: true, rule: rule.keyword, userId: rule.targetId, userName: rule.targetName, collabId: r.collab.id })
      }
    }
    return performed
  }

  // 从文本提取 @成员并标注 isFriend。承 extractMentionedUsers。
  async function extractMentionedUsers(
    text: string,
    forUser: CollabActor | null,
  ): Promise<Array<{ id: string; name: string; isFriend: boolean }>> {
    const names = rawMentionNames(text)
    const out: Array<{ id: string; name: string; isFriend: boolean }> = []
    for (const n of names) {
      const u = await users.byName(n)
      if (!u) continue
      if (forUser && u.id === forUser.id) continue
      out.push({ ...u, isFriend: forUser ? await friends.isFriend(forUser.id, u.id) : true })
    }
    return out
  }

  // 统一结算「@成员协作」意图：真实执行 + 生成与结果一致的状态行。承 settleMentionedCollab。
  async function settleMentionedCollab(args: {
    user: CollabActor | null
    message: string
    taskEntity?: { entity: TaskLike } | null
    performed: Performed[]
    structured?: Mention[]
  }): Promise<{ lines: string[]; names: string[] }> {
    const { user, message, performed } = args
    const taskEntity = args.taskEntity ?? null
    const structured = args.structured ?? []
    const lines: string[] = []
    if (!user) return { lines, names: [] }

    const targets = new Map<string, string>() // userId → 展示名
    const unknown = new Set<string>()
    let assigned = false // 只把第一个成功邀请的成员设为责任人
    const assignResponsible = async (name: string): Promise<void> => {
      if (assigned || !taskEntity) return
      const cur = taskEntity.entity
      if (cur.assignee) {
        assigned = true
        return
      }
      const upd = await tasks.update(cur.id, { assignee: name })
      if (upd) {
        taskEntity.entity = upd
        assigned = true
      }
    }

    for (const mtn of Array.isArray(structured) ? structured : []) {
      if (!mtn || mtn.type !== 'person') continue
      if (mtn.userId) {
        const u = await users.byId(mtn.userId)
        if (u && u.id !== user.id) targets.set(u.id, u.name)
        else if (!u && mtn.label) unknown.add(mtn.label)
      } else if (mtn.label) unknown.add(mtn.label)
    }
    for (const nm of rawMentionNames(message)) {
      const u = await users.byName(nm)
      if (u && u.id !== user.id) targets.set(u.id, u.name)
      else if (!u) unknown.add(nm)
    }
    if (!targets.size && !unknown.size) return { lines, names: [] }

    const invitedIds = new Set(performed.filter((p) => p.type === 'invite').map((p) => p.userId))
    const friendReqIds = new Set(performed.filter((p) => p.type === 'friend_request').map((p) => p.userId))

    for (const [uid, name] of targets) {
      if (invitedIds.has(uid)) {
        await assignResponsible(name)
        lines.push(`🤝 已向 ${name} 发出协作邀请（待对方接受）· 已列为该任务责任人`)
        continue
      }
      if (friendReqIds.has(uid)) {
        lines.push(`👋 ${name} 还不是你的好友——已发送好友请求，成为好友后即可邀请协作`)
        continue
      }
      if (await friends.isFriend(user.id, uid)) {
        if (!taskEntity) {
          lines.push(`ℹ️ 已识别成员 ${name}，但本轮没有可邀请的任务`)
          continue
        }
        const r = await invite(user, taskEntity.entity.id, uid)
        // 承 legacy：reused 邀请仍带 collab，故走首支（其 `else if (r.reused)` 分支实为死代码，此处忠实省略）。
        if ('collab' in r) {
          await assignResponsible(name)
          performed.push({ type: 'invite', userId: uid, userName: name, collabId: r.collab.id, recovered: true })
          lines.push(`🤝 已向 ${name} 发出协作邀请（待对方接受）· 已列为该任务责任人`)
        } else if (r.needConfirm) {
          lines.push(`⚠️ 「${taskEntity.entity.title}」是个人任务，未自动邀请 ${name}；如需协作请在任务详情里确认`)
        } else {
          lines.push(`⚠️ 未能邀请 ${name}：${r.error || '请稍后重试'}`)
        }
      } else {
        const fr = await friends.requestById(user, uid)
        if (fr.autoAccepted) {
          performed.push({ type: 'friend_request', userId: uid, userName: name, auto: true })
          lines.push(`🤝 你和 ${name} 互相请求过，已成为好友；再说一次即可邀请其协作`)
        } else if (fr.friendship || fr.pending) {
          performed.push({ type: 'friend_request', userId: uid, userName: name })
          lines.push(`👋 ${name} 还不是你的好友——已发送好友请求，成为好友后即可邀请协作`)
        } else {
          lines.push(`⚠️ 未能向 ${name} 发送好友请求：${fr.error || '请稍后重试'}`)
        }
      }
    }
    for (const nm of unknown) {
      if ([...targets.values()].includes(nm)) continue
      lines.push(`⚠️ 没找到成员「${nm}」，未发出邀请——确认对方已注册、并且在你的好友列表里`)
    }
    const names = [...new Set([...targets.values(), ...unknown])]
    return { lines, names }
  }

  return {
    invite,
    respondInvite,
    notifyTaskDone,
    maybeCreateAutoRule,
    applyAutoInvites,
    extractMentionedUsers,
    settleMentionedCollab,
  }
}
