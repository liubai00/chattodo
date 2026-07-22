// 组合根：把 db+userId 装配成 app-chat 的全部依赖（repos + capture/tasks/collab/social apps）。
import { makePrefixedId } from '@linx/kernel-ids'
import {
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeCorrectionRepo,
  makeSubtaskRepo,
  makeActivityRepo,
  type Queryable,
} from '@linx/infra-tasks-pg'
import { makeProjectRepo } from '@linx/infra-projects-pg'
import { makeSettingsRepo, makeAgentRepo } from '@linx/infra-settings-pg'
import { makeConversationRepo, makeChatRepo } from '@linx/infra-conversations-pg'
import { makeAiConfigRepo } from '@linx/infra-ai-config-pg'
import { makeAiErrorRepo } from '@linx/infra-ai-errors-pg'
import { makeCollaboratorRepo, makeAutoRuleRepo } from '@linx/infra-collab-pg'
import { makeProjectsApp } from '@linx/app-projects'
import { makeCaptureApp } from '@linx/app-capture'
import { makeTasksApp } from '@linx/app-tasks'
import { makeCollabApp } from '@linx/app-collab'
import { makeChatApp, type ChatAppDeps } from '@linx/app-chat'
import { makeAgentChatApp, type AgentChatDeps } from '@linx/agent-chat-llm'
import { makeLlmClient, type LlmClient } from '@linx/platform-llm'
import type { ProjectRepo } from '@linx/domain-projects'
import type {
  TaskDatabaseActor,
  TaskFieldKind,
  TaskGridViewPatch,
  TaskMutationSource,
} from '@linx/domain-task-database'
import { decodeTaskRef } from '@linx/domain-task-database'
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
} from './wiring.js'
import type { TaskRepoFactory } from './task-repo-factory.js'

export interface ChatWiringDeps {
  db: Queryable
  userId: string
  actor?: TaskDatabaseActor
  source?: TaskMutationSource
  taskRepos?: TaskRepoFactory
  publish: (userId: string, payload: unknown) => void
  publishMany: (userIds: readonly string[], payload: unknown) => void
  /** LLM 客户端（agent 路径）；省略则真实 fetch。注入以便测试。 */
  llm?: LlmClient
  clock?: () => Date
  genId?: (prefix: string) => string
}

/** 组装 CollabApp（与 collab.routes 同构；此处供 chat 编排复用）。 */
export function buildCollabApp(deps: ChatWiringDeps): ReturnType<typeof makeCollabApp> {
  const { db, userId, publish, publishMany } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((p: string): string => makePrefixedId(p)())
  const { nowIso, nowIsoMs } = makeClocks(clock)
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
    events: makeEventBus(publish, publishMany),
  })
}

/** 组装完整 ChatAppDeps 并返回 makeChatApp 实例。 */
export function buildChatApp(deps: ChatWiringDeps): ReturnType<typeof makeChatApp> {
  const { db, userId, publish, publishMany } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((p: string): string => makePrefixedId(p)())
  const { nowIso } = makeClocks(clock)

  const tasks = deps.taskRepos
    ? deps.taskRepos.forRequest({
        actor: deps.actor ?? { id: userId, name: '', email: '', role: 'member' },
        ...(deps.source ? { source: deps.source } : {}),
        clock,
        genId,
      })
    : makeTaskRepo({ db, userId, clock, genId })
  const ideas = makeIdeaRepo({ db, userId, clock, genId })
  const nonTodos = makeNonTodoRepo({ db, userId, clock, genId })
  const captureRecords = makeCaptureRecordRepo({ db, userId, clock, genId })
  const corrections = makeCorrectionRepo({ db, userId, clock, genId })
  const subtasks = makeSubtaskRepo({ db, userId, clock, genId })
  const activity = deps.taskRepos?.backend === 'baserow'
    ? { byTask: async () => [], log: async () => {} }
    : makeActivityRepo({ db, userId, clock, genId })
  const settings = makeSettingsRepo({ db, userId, clock })
  const agent = makeAgentRepo({ db, userId, clock })
  const conversations = makeConversationRepo({ db, userId, clock, genId })
  const rawChat = makeChatRepo({ db, userId, clock, genId })
  let sourceMessageId = deps.source?.kind === 'chat' ? deps.source.messageId : undefined
  const chat = {
    all: rawChat.all,
    create: (data: { id?: string; role: string; text: string; isError?: boolean; conversationId?: string }) => {
      const isSourceMessage = !!sourceMessageId && data.role === 'user' && data.text === deps.source?.text
      const id = data.id || (isSourceMessage ? sourceMessageId : undefined)
      if (isSourceMessage) sourceMessageId = undefined
      return rawChat.create({ ...data, ...(id ? { id } : {}) })
    },
  }
  const aiConfig = makeAiConfigRepo({ db, userId, clock })
  const aiErrors = makeAiErrorRepo({ db, userId, clock, genId })
  const collaborators = makeCollaboratorRepo({ db, userId, clock, genId })
  const legacyProjects = makeProjectRepo({ db, userId })
  const projects: ProjectRepo = deps.taskRepos?.backend === 'baserow'
    ? {
        all: async () => [],
        get: async () => undefined,
        create: async () => { throw new Error('Baserow 首版不支持项目') },
      }
    : legacyProjects

  const projectsApp = makeProjectsApp({ projects })
  const capture = makeCaptureApp({
    tasks,
    ideas,
    nonTodos,
    captureRecords,
    activity,
    projectIdForText: (text: string) => projectsApp.projectIdForText(text),
    now: () => clock().getTime(),
  })
  const tasksApp = makeTasksApp({
    tasks,
    ideas,
    nonTodos,
    captureRecords,
    corrections,
    activity,
    subtasks,
    getPrivacySettings: async () => {
      const s = await settings.get()
      return {
        privacyMode: s?.privacyMode ?? false,
        workspaceMode: (s?.workspaceMode === 'personal' ? 'personal' : 'work') as 'work' | 'personal',
      }
    },
    now: () => clock().getTime(),
  })

  const social = buildSocialApp({ db, publish, nowIso, genId, clock })
  const userDir = makeUserDirectory(db)
  const baserowCollab = {
    async invite(_user: { id: string }, taskId: string, targetUserId: string) {
      const [task, target] = await Promise.all([tasks.get(taskId), userDir.byId(targetUserId)])
      if (!task || !target) return { error: '任务或负责人不存在' }
      const updated = await tasks.update(taskId, { assignee: target.name })
      if (!updated) return { error: '没有修改该任务的权限' }
      return { collab: { id: `baserow:${taskId}:${target.id}` } }
    },
    async respondInvite() { return null },
    async notifyTaskDone() {},
    async maybeCreateAutoRule() { return null },
    async applyAutoInvites() { return [] },
    async settleMentionedCollab(args: {
      taskEntity?: { entity: { id?: string; title?: string } } | null
      performed: unknown[]
      structured?: Array<{ type: string; label?: string; userId?: string }>
    }) {
      const mention = (args.structured || []).find((item) => item.type === 'person')
      const taskId = args.taskEntity?.entity?.id
      const target = mention?.userId
        ? await userDir.byId(mention.userId)
        : mention?.label
          ? await userDir.byName(mention.label)
          : undefined
      if (!taskId || !target) return { lines: [], names: mention?.label ? [mention.label] : [] }
      const task = await tasks.get(taskId)
      const updated = await tasks.update(taskId, { assignee: target.name })
      if (!task || !updated) return { lines: [`未能把任务指派给 ${target.name}。`], names: [target.name] }
      args.performed.push({ type: 'assign_task', id: taskId, userId: target.id, userName: target.name })
      return { lines: [`已将负责人设为 ${target.name}。`], names: [target.name] }
    },
  }
  const collab = deps.taskRepos?.backend === 'baserow' ? baserowCollab : buildCollabApp(deps)
  const chatCollaborators = deps.taskRepos?.backend === 'baserow'
    ? { myPending: async () => [] }
    : collaborators
  const databaseActor = deps.actor ?? {
    id: userId,
    name: '',
    email: '',
    role: 'member',
  }
  const database = deps.taskRepos?.database
  const taskDatabase = database
    ? {
        schema: () => database.schema(databaseActor),
        listRows: (space: 'team' | 'personal') => database.listRows(databaseActor, space),
        updateRow: (id: string, values: Readonly<Record<string, unknown>>) => {
          const ref = decodeTaskRef(id)
          if (!ref) throw new TypeError('任务引用无效')
          return database.updateRow(
            databaseActor,
            ref,
            values,
            deps.source ?? { kind: 'system', text: 'LinX AI 修改任务动态属性' },
          )
        },
        getView: (space: 'team' | 'personal') => database.getView(databaseActor, space),
        createField: (
          space: 'team' | 'personal',
          field: {
            name: string
            type: TaskFieldKind
            options?: Readonly<Record<string, unknown>>
          },
        ) => database.createField(databaseActor, space, field),
        updateField: (
          space: 'team' | 'personal',
          fieldId: number,
          patch: Readonly<Record<string, unknown>>,
          confirmed: boolean,
        ) => database.updateField(
          databaseActor,
          space,
          fieldId,
          patch,
          confirmed ? 'confirmed-by-linx' : undefined,
        ),
        deleteField: (
          space: 'team' | 'personal',
          fieldId: number,
          confirmed: boolean,
        ) => database.deleteField(
          databaseActor,
          space,
          fieldId,
          confirmed ? 'confirmed-by-linx' : '',
        ),
        updateView: (
          space: 'team' | 'personal',
          patch: Readonly<Record<string, unknown>>,
        ) => database.updateView(databaseActor, space, patch as TaskGridViewPatch),
      }
    : undefined

  // agent-chat-llm（LLM 脑）：与 ruleChat 复用同批 repos/apps；结构一致处的差异经组合根边界强转。
  const agentChatFn = makeAgentChatApp({
    llm: deps.llm ?? makeLlmClient(),
    settings,
    tasks: tasks as unknown as AgentChatDeps['tasks'],
    ideas: ideas as unknown as AgentChatDeps['ideas'],
    nonTodos: nonTodos as unknown as AgentChatDeps['nonTodos'],
    projects: projects as unknown as AgentChatDeps['projects'],
    projectIdForText: (t: string) => projectsApp.projectIdForText(t),
    agent,
    chat,
    captureRecords: { create: (i: Record<string, unknown>) => captureRecords.create(i as never) },
    activity,
    collaborators: chatCollaborators,
    capture: capture as unknown as AgentChatDeps['capture'],
    tasksApp: tasksApp as unknown as AgentChatDeps['tasksApp'],
    collab: collab as unknown as NonNullable<AgentChatDeps['collab']>,
    social: social as unknown as NonNullable<AgentChatDeps['social']>,
    users: userDir,
    ...(taskDatabase ? { taskDatabase } : {}),
    teamNames: async (): Promise<string[]> => {
      const ids = await social.friendIds(userId)
      const out: string[] = []
      for (const id of ids.slice(0, 20)) {
        const u = await userDir.byId(id)
        if (u?.name) out.push(u.name)
      }
      return out
    },
    clock,
  })

  const chatDeps: ChatAppDeps = {
    tasks,
    ideas,
    settings,
    chat,
    conversations,
    // 适配：app-chat 的宽松入参 → infra 的 NewCaptureRecordInput（组合根边界强转）。
    captureRecords: { create: (input: Record<string, unknown>) => captureRecords.create(input as never) },
    activity,
    aiConfig,
    aiErrors,
    agent,
    capture,
    tasksApp,
    // collab/social 与 app-chat 端口方法逐一同构，仅 TaskLike 索引签名差异 → 组合根边界强转。
    collab: collab as unknown as NonNullable<ChatAppDeps['collab']>,
    collaborators: chatCollaborators,
    social: social as unknown as NonNullable<ChatAppDeps['social']>,
    // agent 路径：适配 aiConfig(unknown) → LlmConfig。
    agentChat: (args) => agentChatFn({ ...args, aiConfig: args.aiConfig as never }),
    clock,
  }
  return makeChatApp(chatDeps)
}
