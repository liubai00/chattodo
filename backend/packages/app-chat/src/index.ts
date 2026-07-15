// @linx/app-chat — 聊天回合编排（干净重写 services/chat.js）。
// chat() 入口：配了 LLM → agentChat（注入，P7.5）；否则 ruleChat 离线规则脑。
// 只复刻前端依赖的统一 TurnResult 契约，不追求 legacy 字节级一致。
import {
  detectIntent,
  extractCommandTarget,
  triageInputSync,
  detectDue,
  splitSegments,
  parseTaskCommand,
} from '@linx/agent-planner-rule'
import { visibleFilter } from '@linx/domain-settings'
import { planNextBlock, type PlanTask } from '@linx/app-plan'
import type { Mention } from '@linx/domain-collab'

// —— 结构化实体（结构化类型，避免重依赖）——
export interface TaskLike {
  id: string
  title: string
  dueAt?: string | null
  priority: number
  status: string
  privacyScope?: string
  createdAt?: string
}
export interface IdeaLike {
  id: string
  title: string
  rawText?: string
  status: string
  source?: string
  createdAt?: string
}
export interface ChatMessageLike {
  role: string
  text: string
}

export interface TurnEntity {
  type: string
  entity: unknown
  result?: unknown
}
export interface TurnResult {
  intent: string
  reply: string
  entities: TurnEntity[]
  plan: unknown | null
  performed: unknown[]
  userMessage: unknown
  agentMessage: unknown
  conversationId?: string | null
}

// —— 注入端口 ——
export interface ChatActor {
  id: string
  name?: string
}

export interface ChatTaskRepo {
  all(): Promise<TaskLike[]>
  get(id: string): Promise<TaskLike | undefined>
  update(id: string, patch: Record<string, unknown>): Promise<TaskLike | undefined>
  remove(id: string): Promise<void>
}
export interface ChatIdeaRepo {
  all(): Promise<IdeaLike[]>
}
export interface ChatSettingsRepo {
  get(): Promise<{ privacyMode: boolean; workspaceMode: string } | undefined>
}
export interface ChatMessagesRepo {
  all(conversationId?: string): Promise<ChatMessageLike[]>
  create(data: { role: string; text: string; isError?: boolean; conversationId?: string }): Promise<unknown>
}
export interface ChatConversationRepo {
  get(id: string): Promise<unknown>
  latestId(): Promise<string | null>
  ensureDefault(): Promise<string>
  touch(id: string, message?: string): Promise<void>
}
export interface ChatCaptureRecordRepo {
  create(input: Record<string, unknown>): Promise<unknown>
}
export interface ChatActivityRepo {
  log(taskId: string, text: string): Promise<void>
}
export interface ChatAiConfigRepo {
  get(): Promise<{ provider: string; apiKey: string; fallbackToRule: boolean; model?: string; baseUrl?: string } | undefined>
}
export interface ChatAiErrorRepo {
  create(data: { rawInput?: string; message?: string }): Promise<string>
}
export interface ChatAgentRepo {
  get(): Promise<{ memory?: string } | undefined>
  update(patch: { memory?: string }): Promise<unknown>
}
export interface ChatCaptureApp {
  capture(input: { text: string; source?: string }): Promise<{ result: TriageResultLike; entityType: string; entity: TaskLike | unknown }>
}
export interface ChatTasksApp {
  convertIdea(id: string): Promise<{ task: TaskLike; idea: unknown } | null>
}
export interface TriageResultLike {
  kind: 'task' | 'todo_idea' | 'non_todo'
  title: string
  reason?: string
  suggestedNextAction?: string
}

// 协作/好友端口（present ⇔ db+user 模式；单用户/无鉴权时为 undefined）。
export interface ChatCollabApp {
  respondInvite(
    user: ChatActor,
    inviteId: string,
    mode: 'accept' | 'decline' | 'follow',
    remind?: boolean,
  ): Promise<{ collab: unknown; taskTitle: string; task: unknown } | null>
  notifyTaskDone(user: ChatActor | null, taskId: string): Promise<void>
  maybeCreateAutoRule(note: string, user: ChatActor | null): Promise<{ id: string; keyword: string; targetName: string } | null>
  applyAutoInvites(user: ChatActor | null, task: { id: string; title: string }, rawText: string): Promise<Array<{ rule?: string; userName: string }>>
  settleMentionedCollab(args: {
    user: ChatActor | null
    message: string
    taskEntity?: { entity: TaskLike } | null
    performed: unknown[]
    structured?: Mention[]
  }): Promise<{ lines: string[]; names: string[] }>
}
export interface ChatCollaboratorRepo {
  myPending(): Promise<Array<{ id: string; inviterName: string }>>
}
export interface ChatSocialApp {
  requestByEmail(user: ChatActor, email: string): Promise<Record<string, unknown>>
  respond(user: ChatActor, friendshipId: string, accept: boolean): Promise<unknown>
  overview(userId: string): Promise<{ incoming: Array<{ friendshipId: string; name: string }> }>
}

/** LLM 脑（agent-chat-llm，P7.5 注入）。返回统一 TurnResult。 */
export type AgentChatFn = (args: {
  message: string
  aiConfig: unknown
  onEvent?: ChatOnEvent
  user?: ChatActor
  mentions?: Mention[]
}) => Promise<TurnResult>

export type ChatOnEvent = (e: { type: 'status'; intent: string } | { type: 'delta'; text: string }) => void

export interface ChatAppDeps {
  tasks: ChatTaskRepo
  ideas: ChatIdeaRepo
  settings: ChatSettingsRepo
  chat: ChatMessagesRepo
  conversations?: ChatConversationRepo
  captureRecords: ChatCaptureRecordRepo
  activity: ChatActivityRepo
  aiConfig: ChatAiConfigRepo
  aiErrors: ChatAiErrorRepo
  agent: ChatAgentRepo
  capture: ChatCaptureApp
  tasksApp: ChatTasksApp
  collab?: ChatCollabApp
  collaborators?: ChatCollaboratorRepo
  social?: ChatSocialApp
  agentChat?: AgentChatFn
  clock?: () => Date
}

export interface ChatInput {
  message: string
  onEvent?: ChatOnEvent
  user?: ChatActor
  mentions?: Mention[]
  conversationId?: string
}

// ————————————————————————————————————————————————————————
// 纯工具（承 chat.js）
// ————————————————————————————————————————————————————————

/** 身份/模型提问（短句 + 对「你/您」的自我指涉）。 */
export function isIdentityQuestion(message: string): boolean {
  const m = String(message || '').trim()
  if (m.length > 16) return false
  if (/^(你|您|你们)/.test(m) && /(什么|啥|哪个|哪家|哪种).{0,3}(模型|大模型|大语言模型|ai|llm)/i.test(m)) return true
  if (/^(你|您)是谁[?？]?$/.test(m)) return true
  if (/^(你|您)(叫什么|叫啥|的名字|是什么).{0,5}$/.test(m)) return true
  if (/(什么|哪个|啥)模型(驱动|支持|在跑|运行|的你)/.test(m)) return true
  return false
}

export function identityReply(aiConfig: { provider?: string; apiKey?: string; model?: string; baseUrl?: string } | null | undefined): string {
  if (!aiConfig || aiConfig.provider === 'rule' || !aiConfig.apiKey) {
    return '我是 LinX 灵信的 todo-first 智能助理，目前运行在离线规则模式（尚未接入大语言模型）。在「设置 · AI 接入」配置模型后，我就能自然对话并代你操作任务。'
  }
  const model = aiConfig.model || '（未指定型号）'
  let host = ''
  try {
    host = new URL(/:\/\//.test(aiConfig.baseUrl || '') ? (aiConfig.baseUrl as string) : 'https://' + (aiConfig.baseUrl || 'api.anthropic.com')).hostname
  } catch {
    /* ignore */
  }
  const via = aiConfig.provider === 'anthropic' ? 'Anthropic 官方接口' : host || 'OpenAI 兼容接口'
  return `我是 LinX 灵信的 todo-first 智能助理，当前由模型 ${model} 驱动（接入自 ${via}）。我能把你的想法判断为任务 / 待澄清 / 非 todo，安排计划，并和团队协作。`
}

function makeFmtDue(clock: () => Date) {
  return (iso: string | null | undefined): string => {
    if (!iso) return '待定'
    const d = new Date(iso)
    const t = clock()
    const sod = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diff = Math.round((sod(d) - sod(t)) / 86400000)
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    if (diff < 0) return `已逾期 ${-diff} 天`
    if (diff <= 6) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] as string
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
}

function matchTasks(tasks: TaskLike[], target: string | undefined): TaskLike[] {
  if (!target) return []
  const q = target.toLowerCase()
  const exact = tasks.filter((t) => t.title.toLowerCase() === q)
  if (exact.length) return exact
  return tasks.filter((t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase()))
}

/** 长期记忆追加（承 agentChat.appendMemory；200 字上限 + 日期条目 + 1600 字环形截断）。 */
export async function appendMemory(agent: ChatAgentRepo, note: string, clock: () => Date): Promise<void> {
  const clean = String(note || '').trim().slice(0, 200)
  if (!clean) return
  const cur = ((await agent.get()) ?? {}).memory || ''
  const d = clock()
  let next = (cur ? cur + '\n' : '') + `· [${d.getMonth() + 1}/${d.getDate()}] ${clean}`
  if (next.length > 1600) next = next.slice(next.length - 1600).replace(/^[^·]*·/, '·')
  await agent.update({ memory: next })
}

export function makeChatApp(deps: ChatAppDeps): {
  chat(input: ChatInput): Promise<TurnResult>
  isIdentityQuestion: typeof isIdentityQuestion
  identityReply: typeof identityReply
} {
  const clock = deps.clock ?? ((): Date => new Date())
  const nowMs = (): number => clock().getTime()
  const fmtDue = makeFmtDue(clock)
  const listLines = (tasks: TaskLike[]): string =>
    tasks.map((t, i) => `${i + 1}. ${t.title}（${fmtDue(t.dueAt)} · P${t.priority}）`).join('\n')

  const openTasksOf = async (): Promise<TaskLike[]> => {
    const settings = (await deps.settings.get()) ?? { privacyMode: false, workspaceMode: 'work' }
    return visibleFilter(await deps.tasks.all(), settings).filter((t) => t.status !== 'done' && t.status !== 'archived')
  }

  // 澄清闭环：15 分钟内经聊天产生、仍待澄清的想法。
  const findPendingClarify = async (): Promise<IdeaLike | null> => {
    const idea = (await deps.ideas.all()).find((i) => i.status === 'clarifying' && i.source === 'chat')
    if (!idea) return null
    return nowMs() - new Date(idea.createdAt ?? 0).getTime() < 15 * 60 * 1000 ? idea : null
  }

  // 重复检测：7 天内同名（忽略空白/大小写）未归档任务。
  const findDuplicate = async (text: string): Promise<TaskLike | null> => {
    const norm = (x: string | undefined | null): string => String(x || '').replace(/\s+/g, '').toLowerCase()
    const q = norm(text)
    if (!q) return null
    const weekAgo = nowMs() - 7 * 86400000
    return (
      (await deps.tasks.all()).find(
        (t) => t.status !== 'archived' && new Date(t.createdAt ?? 0).getTime() > weekAgo && norm(t.title) === q,
      ) ?? null
    )
  }

  // finish 装配：落 user + agent 两条消息，返回统一 TurnResult。
  const finish = async (scopedChat: ChatMessagesRepo, o: {
    message: string
    intent: string
    reply: string
    entities?: TurnEntity[]
    plan?: unknown | null
    performed?: unknown[]
    isError?: boolean
  }): Promise<TurnResult> => {
    const userMessage = await scopedChat.create({ role: 'user', text: o.message })
    const agentMessage = await scopedChat.create({ role: 'agent', text: o.reply, isError: o.isError ?? false })
    return {
      intent: o.intent,
      reply: o.reply,
      entities: o.entities ?? [],
      plan: o.plan ?? null,
      performed: o.performed ?? [],
      userMessage,
      agentMessage,
    }
  }

  // ———— 离线规则脑 ————
  async function ruleChat(
    scopedChat: ChatMessagesRepo,
    { message, user, mentions = [] }: { message: string; user?: ChatActor; mentions?: Mention[] },
  ): Promise<TurnResult> {
    // 协作邀请对话式确认：接受/拒绝/关注
    if (deps.collab && deps.collaborators) {
      const pending = await deps.collaborators.myPending()
      const m = message.trim()
      if (pending.length && m.length <= 12 && /^(接受|好的?|可以|行|加入|同意|关注|仅关注|只关注|拒绝|不了|不用了?|先不|婉拒)[!！。~～]*$/.test(m)) {
        const mode: 'accept' | 'decline' | 'follow' = /^(仅?只?关注)/.test(m) ? 'follow' : /^(接受|好的?|可以|行|加入|同意)/.test(m) ? 'accept' : 'decline'
        const inv = pending[0]!
        const r = await deps.collab.respondInvite(user ?? { id: '' }, inv.id, mode, true)
        if (r) {
          const rest = pending.length - 1
          const tail = rest > 0 ? `\n（还有 ${rest} 条待处理邀请）` : ''
          const reply =
            mode === 'accept'
              ? `✅ 已加入「${r.taskTitle}」的协作，任务已进入你的 Todo 数据库并开启到期提醒。${tail}`
              : mode === 'follow'
                ? `👀 已关注「${r.taskTitle}」——不进入你的任务库，进展（如完成）会通知你。${tail}`
                : `已婉拒「${r.taskTitle}」的协作邀请，已通知 ${inv.inviterName}。${tail}`
          return finish(scopedChat, {
            message,
            intent: 'respond_invite',
            reply,
            entities: mode === 'accept' && r.task ? [{ type: 'task', entity: r.task }] : [],
            performed: [{ type: 'respond_invite', id: inv.id, accept: mode !== 'decline', mode }],
          })
        }
      }
    }

    // 好友对话式：加好友 / 同意·拒绝好友请求
    if (deps.social && user) {
      const m = message.trim()
      const em = (m.match(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/) || [])[1]
      const explicitAdd =
        /^(?:帮我|请)?(?:加|添加|新增)(?:个|一个)?好友/.test(m) ||
        (!!em && /(加|添加|新增).{0,3}好友|好友.{0,3}(加|添加)|加为好友/.test(m))
      if (explicitAdd && m.length <= 60) {
        if (!em) {
          return finish(scopedChat, { message, intent: 'friend', reply: '添加好友需要对方的完整注册邮箱（不提供按名字搜索，保护隐私）。直接发「加好友 对方邮箱」即可。' })
        }
        const r = (await deps.social.requestByEmail(user, em)) as {
          error?: string
          already?: boolean
          pending?: boolean
          autoAccepted?: boolean
          target?: { name?: string }
        }
        const tName = r.target?.name ?? ''
        const reply = r.error
          ? `好友请求未发出：${r.error}`
          : r.already
            ? `你和 ${tName} 已经是好友了，可以直接 @${tName} 邀请协作。`
            : r.pending
              ? `你已经向 ${tName} 发过好友请求了，等对方处理即可。`
              : r.autoAccepted
                ? `🤝 你们互相发过请求——已直接和 ${tName} 成为好友！现在可以互相 @提及与邀请协作。`
                : `👋 已向 ${tName} 发送好友请求，对方在通知中心接受后即可互相协作。`
        return finish(scopedChat, {
          message,
          intent: 'friend',
          reply,
          isError: !!r.error,
          performed: r.error ? [] : [{ type: 'add_friend', email: em, userName: tName, auto: !!r.autoAccepted, already: !!r.already }],
        })
      }
      if (/^(同意|接受|通过|拒绝|婉拒|不加).{0,6}好友/.test(m) && m.length <= 20) {
        const accept = /^(同意|接受|通过)/.test(m)
        const { incoming } = await deps.social.overview(user.id)
        if (!incoming.length) return finish(scopedChat, { message, intent: 'friend', reply: '当前没有待处理的好友请求。' })
        const req0 = incoming[0]!
        const r = await deps.social.respond(user, req0.friendshipId, accept)
        const rest = incoming.length - 1
        const tail = rest > 0 ? `（还有 ${rest} 条好友请求待处理）` : ''
        return finish(scopedChat, {
          message,
          intent: 'friend',
          reply: r ? (accept ? `🤝 已和 ${req0.name} 成为好友，现在可以互相 @提及与邀请协作。${tail}` : `已拒绝 ${req0.name} 的好友请求（不会通知对方）。${tail}`) : '这条好友请求已被处理过了。',
          performed: r ? [{ type: 'respond_friend', friendshipId: req0.friendshipId, accept }] : [],
        })
      }
    }

    const intent = detectIntent(message)

    if (intent === 'greeting') {
      const hi = user && user.name ? `你好，${user.name}，我在。` : '你好，我在。'
      return finish(scopedChat, { message, intent, reply: `${hi}把想法、任务直接丢给我，我来判断与整理；也可以问我「接下来做什么」，或说「把 XX 标记完成」。` })
    }
    if (intent === 'help') {
      return finish(scopedChat, {
        message,
        intent,
        reply: '我是你的 todo-first 助理，你可以：\n1. 直接丢一句想法 → 我判断是任务 / 待澄清 / 非 todo 并归档；\n2. 问「接下来两小时做什么」→ 生成执行计划；\n3. 说「有哪些任务 / 今天到期的任务」→ 查询清单；\n4. 说「把 XX 标记完成」「删除 XX」→ 直接操作任务；\n5. 在设置 · AI 接入里配置真实模型后，我还能自然对话并代你操作。',
      })
    }
    if (intent === 'plan') {
      const settings = (await deps.settings.get()) ?? { privacyMode: false, workspaceMode: 'work' }
      const tasks = visibleFilter(await deps.tasks.all(), settings) as PlanTask[]
      const { plan } = planNextBlock(tasks)
      const reply =
        plan.length === 0
          ? '当前可见 todo 中没有可安排的任务。先添加几条任务，或切换隐私范围试试。'
          : `基于当前可见 todo，建议接下来这样安排：\n${plan.map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`).join('\n')}\n\n（已排除 NonTodo 隔离输出与隐私隐藏的任务）`
      return finish(scopedChat, { message, intent, reply, plan })
    }
    if (intent === 'query') {
      const open = await openTasksOf()
      const m = message
      let list = open
      let label = '未完成任务'
      const sod = (x: string | Date): number => {
        const d = new Date(x)
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      }
      const today = sod(clock())
      if (/(今天|今日)/.test(m)) {
        list = open.filter((t) => t.dueAt && sod(t.dueAt) === today)
        label = '今天到期'
      } else if (/(逾期|过期)/.test(m)) {
        list = open.filter((t) => t.dueAt && sod(t.dueAt) < today)
        label = '已逾期'
      } else if (/(本周|这周)/.test(m)) {
        list = open.filter((t) => t.dueAt && sod(t.dueAt) >= today && sod(t.dueAt) < today + 7 * 86400000)
        label = '本周到期'
      } else if (/完成/.test(m) && /(已|哪些)/.test(m)) {
        const settings = (await deps.settings.get()) ?? { privacyMode: false, workspaceMode: 'work' }
        list = visibleFilter(await deps.tasks.all(), settings).filter((t) => t.status === 'done')
        label = '已完成'
      }
      const sorted = [...list].sort((a, b) => (String(a.dueAt || '9999') < String(b.dueAt || '9999') ? -1 : 1)).slice(0, 10)
      const reply =
        sorted.length === 0
          ? `${label}：暂时没有。${label === '已逾期' ? '很好，没有拖欠。' : ''}`
          : `${label} 共 ${list.length} 条${list.length > 10 ? '（只列前 10 条）' : ''}：\n${listLines(sorted)}`
      return finish(scopedChat, { message, intent, reply })
    }
    if (intent === 'complete' || intent === 'delete') {
      const target = extractCommandTarget(message)
      const open =
        intent === 'complete'
          ? await openTasksOf()
          : await (async (): Promise<TaskLike[]> => {
              const settings = (await deps.settings.get()) ?? { privacyMode: false, workspaceMode: 'work' }
              return visibleFilter(await deps.tasks.all(), settings).filter((t) => t.status !== 'archived')
            })()
      const hits = matchTasks(open, target)
      if (!target || hits.length === 0) {
        return finish(scopedChat, { message, intent, reply: `没有找到标题匹配「${target || message}」的任务。可以先说「有哪些任务」看看清单，或换个更接近任务标题的说法。` })
      }
      if (hits.length > 1) {
        return finish(scopedChat, { message, intent, reply: `找到 ${hits.length} 条相近的任务，说得再具体一点（用完整标题）：\n${listLines(hits.slice(0, 5))}` })
      }
      const t = hits[0]!
      if (intent === 'complete') {
        const task = await deps.tasks.update(t.id, { status: 'done' })
        await deps.activity.log(t.id, '通过聊天标记完成')
        if (deps.collab) await deps.collab.notifyTaskDone(user ?? null, t.id)
        return finish(scopedChat, { message, intent, reply: `✅ 已完成「${t.title}」。`, performed: [{ type: 'complete_task', id: t.id, task }] })
      }
      await deps.tasks.remove(t.id)
      return finish(scopedChat, { message, intent, reply: `🗑️ 已删除「${t.title}」。`, performed: [{ type: 'delete_task', id: t.id, title: t.title }] })
    }
    if (intent === 'modify') {
      const cmd = parseTaskCommand(message, nowMs())
      if (!cmd) {
        return finish(scopedChat, { message, intent, reply: '没识别到要修改什么，可以说「把 XX 改到明天」「把 XX 设为 P1」「开始做 XX」「把 XX 改名为 YY」。' })
      }
      const settings = (await deps.settings.get()) ?? { privacyMode: false, workspaceMode: 'work' }
      const open = visibleFilter(await deps.tasks.all(), settings).filter((t) => t.status !== 'archived')
      const hits = matchTasks(open, cmd.target)
      if (!hits.length) {
        return finish(scopedChat, { message, intent, reply: `没找到标题匹配「${cmd.target}」的任务，未做修改。先说「有哪些任务」看看清单，或换个更接近标题的说法；如果想新建，直接描述这件事即可。` })
      }
      if (hits.length > 1) {
        return finish(scopedChat, { message, intent, reply: `找到 ${hits.length} 条相近的任务，说得更具体些（用完整标题）：\n${listLines(hits.slice(0, 5))}` })
      }
      const t = hits[0]!
      const patch: Record<string, unknown> = {}
      let desc = ''
      if (cmd.op === 'due') {
        patch.dueAt = cmd.value
        desc = `截止时间改到 ${fmtDue(cmd.value as string)}`
      } else if (cmd.op === 'priority') {
        patch.priority = cmd.value
        desc = `优先级设为 P${cmd.value}`
      } else if (cmd.op === 'status') {
        patch.status = cmd.value
        desc = '状态设为「进行中」'
      } else if (cmd.op === 'title') {
        patch.title = cmd.value
        desc = `标题改为「${cmd.value}」`
      }
      const task = await deps.tasks.update(t.id, patch)
      await deps.activity.log(t.id, '通过聊天' + desc)
      return finish(scopedChat, { message, intent, reply: `✏️ 已更新「${cmd.op === 'title' ? cmd.value : t.title}」：${desc}。`, entities: [{ type: 'task', entity: task }], performed: [{ type: 'update_task', id: t.id, task }] })
    }
    if (intent === 'remember') {
      const note = message.replace(/^记住[:：，,\s]*/, '').trim() || message
      await appendMemory(deps.agent, note, clock)
      let reply = `🧠 已写入长期记忆：「${note.slice(0, 60)}」。之后判断与规划会参考它（可在 Agent 配置 · 记忆 中查看和修改）。`
      const performed: unknown[] = [{ type: 'remember', note: note.slice(0, 80) }]
      if (deps.collab) {
        const rule = await deps.collab.maybeCreateAutoRule(note, user ?? null)
        if (rule) {
          reply += `\n⚙️ 已建立自动规则：新任务包含「${rule.keyword}」→ 自动邀请 ${rule.targetName} 协作。`
          performed.push({ type: 'auto_rule', id: rule.id, keyword: rule.keyword, targetName: rule.targetName })
        }
      }
      return finish(scopedChat, { message, intent, reply, performed })
    }
    if (intent === 'question') {
      return finish(scopedChat, {
        message,
        intent,
        reply: '这更像一个问题，我没有把它记成待办。规则模式下我不擅长开放问答 — 在 设置 · AI 接入 配置真实模型后我可以直接回答；如果它其实是件要做的事，可以说「帮我记：…」。',
      })
    }

    // ——— capture 落库前三道闸 ———
    // 1) 澄清闭环
    const pending = await findPendingClarify()
    if (pending) {
      if (/^(跳过|算了|不用了?|先不|不转|保持现状)/.test(message.trim())) {
        return finish(scopedChat, { message, intent: 'clarify_skip', reply: `好，「${pending.title}」继续留在待澄清区，想补充时随时说。` })
      }
      const probe = triageInputSync(message, nowMs())
      const answerish = probe.kind !== 'task' || /(目标|输出|完成标准|标准是|就是|想要|需要产出|补充|针对|关于这)/.test(message)
      if (answerish) {
        const conv = await deps.tasksApp.convertIdea(pending.id)
        if (conv) {
          const due = detectDue(message, nowMs())
          const patch: Record<string, unknown> = { notes: `${pending.rawText ?? ''}\n补充：${message}` }
          if (due) patch.dueAt = due
          const task = await deps.tasks.update(conv.task.id, patch)
          await deps.captureRecords.create({ rawInput: message, source: 'chat', aiKind: 'task', confidence: 0.9, aiReason: '澄清补充后转为正式任务', resultEntityType: 'task', resultEntityId: task?.id, status: 'ok' })
          return finish(scopedChat, {
            message,
            intent: 'clarify_convert',
            reply: `👌 已结合补充信息，把「${pending.title}」转为正式任务${due ? `（截止 ${fmtDue(due)}）` : ''}。`,
            entities: [{ type: 'task', entity: task }],
            performed: [{ type: 'convert_idea', ideaId: pending.id, id: task?.id, title: task?.title }],
          })
        }
      }
    }

    // 2) 重复检测（重复警告后再次发送相同内容才强制新建）
    const dup = await findDuplicate(message)
    const allMsgs = await scopedChat.all()
    const prevUser = allMsgs.filter((x) => x.role === 'user').slice(-1)[0]
    const lastAgent = allMsgs.filter((x) => x.role === 'agent').slice(-1)[0]
    const forced = !!(prevUser && prevUser.text.trim() === message.trim() && lastAgent && lastAgent.text.includes('和已有任务重复'))
    if (dup && !forced) {
      return finish(scopedChat, { message, intent: 'duplicate', reply: `这条和已有任务重复：「${dup.title}」（${dup.status === 'done' ? '已完成' : '未完成'} · ${fmtDue(dup.dueAt)}）。\n确实要再建一条的话，再发送一次相同内容即可。` })
    }

    // 3) 多条拆分 → 逐条 triage 归档
    const segments = splitSegments(message)
    const created: TurnEntity[] = []
    for (const seg of segments) {
      const r = await deps.capture.capture({ text: seg, source: 'chat' })
      created.push({ type: r.entityType, entity: r.entity, result: r.result })
    }
    if (created.length > 1) {
      const label: Record<string, string> = { task: '任务', todo_idea: '待澄清', non_todo: '非 todo' }
      const lines = created.map((e, i) => `${i + 1}. ${(e.entity as TaskLike).title}（${label[e.type]}）`).join('\n')
      return finish(scopedChat, { message, intent: 'capture', reply: `已拆成 ${created.length} 条分别归档：\n${lines}`, entities: created })
    }
    const first = created[0]!
    const result = first.result as TriageResultLike
    let reply =
      result.kind === 'task'
        ? `✅ 已进入 todo 主系统：${result.title}\n${result.reason ?? ''}`
        : result.kind === 'todo_idea'
          ? `📥 已进入待澄清区：${result.title}\n建议下一步：${result.suggestedNextAction ?? ''}\n（直接回复补充目标或时间，我就转成正式任务；回复「跳过」保持现状）`
          : `◽️ 非 todo，已隔离输出：${result.title}\n原因：${result.reason ?? ''}（未进入 todo 主系统）`

    // 结构化时间提及 → 补 dueAt
    const tIso = (mentions || []).find((m) => m.type === 'time' && m.iso)
    if (tIso) {
      for (const c of created) {
        const ent = c.entity as TaskLike
        if (c.type === 'task' && ent && !ent.dueAt) c.entity = await deps.tasks.update(ent.id, { dueAt: tIso.iso })
      }
    }

    // @成员 → 协作邀请结算 + 自动规则
    const performed: unknown[] = []
    if (deps.collab && first.type === 'task') {
      const settled = await deps.collab.settleMentionedCollab({ user: user ?? null, message, taskEntity: first as { entity: TaskLike }, performed, structured: mentions })
      if (settled.lines.length) reply += '\n' + settled.lines.join('\n')
      for (const p of await deps.collab.applyAutoInvites(user ?? null, { id: (first.entity as TaskLike).id, title: (first.entity as TaskLike).title }, message)) {
        reply += `\n⚙️ 按你的规则「${p.rule}」，已自动邀请 ${p.userName} 协作（待接受）`
        performed.push(p)
      }
    }
    return finish(scopedChat, { message, intent: 'capture', reply, entities: created, performed })
  }

  // ———— 入口 ————
  async function chat(input: ChatInput): Promise<TurnResult> {
    const { message, onEvent, user, mentions = [], conversationId } = input
    const aiConfig = (await deps.aiConfig.get()) ?? null

    // 解析活动会话 + 置顶/自动命名 + chat 读写作用域绑定
    let convId: string | null = null
    if (deps.conversations) {
      if (conversationId && (await deps.conversations.get(conversationId))) convId = conversationId
      else convId = (await deps.conversations.latestId()) || (await deps.conversations.ensureDefault())
      await deps.conversations.touch(convId, message)
    }
    const scopedChat: ChatMessagesRepo = convId
      ? {
          all: () => deps.chat.all(convId as string),
          create: (d) => deps.chat.create({ ...d, conversationId: convId as string }),
        }
      : deps.chat
    const withConv = (r: TurnResult): TurnResult => {
      r.conversationId = convId
      return r
    }

    if (isIdentityQuestion(message)) {
      if (onEvent) onEvent({ type: 'status', intent: 'identity' })
      return withConv(await finish(scopedChat, { message, intent: 'identity', reply: identityReply(aiConfig) }))
    }

    const useLlm = !!(aiConfig && aiConfig.provider !== 'rule' && aiConfig.apiKey)
    if (onEvent) onEvent({ type: 'status', intent: useLlm ? 'agent' : detectIntent(message) })

    if (useLlm && deps.agentChat) {
      try {
        const r = await deps.agentChat({ message, aiConfig, ...(onEvent ? { onEvent } : {}), ...(user ? { user } : {}), mentions })
        return withConv(r)
      } catch (err) {
        await deps.aiErrors.create({ rawInput: message, message: (err as Error).message })
        if (aiConfig && aiConfig.fallbackToRule === false) {
          return withConv(await finish(scopedChat, { message, intent: 'agent', reply: 'AI 处理失败，请点重试。', isError: true }))
        }
        // fall through to rule chat
      }
    }
    return withConv(await ruleChat(scopedChat, { message, ...(user ? { user } : {}), mentions }))
  }

  return { chat, isIdentityQuestion, identityReply }
}
