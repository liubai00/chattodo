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

export interface ChatWiringDeps {
  db: Queryable
  userId: string
  publish: (userId: string, payload: unknown) => void
  publishMany: (userIds: readonly string[], payload: unknown) => void
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

  const tasks = makeTaskRepo({ db, userId, clock, genId })
  const ideas = makeIdeaRepo({ db, userId, clock, genId })
  const nonTodos = makeNonTodoRepo({ db, userId, clock, genId })
  const captureRecords = makeCaptureRecordRepo({ db, userId, clock, genId })
  const corrections = makeCorrectionRepo({ db, userId, clock, genId })
  const subtasks = makeSubtaskRepo({ db, userId, clock, genId })
  const activity = makeActivityRepo({ db, userId, clock, genId })
  const settings = makeSettingsRepo({ db, userId, clock })
  const agent = makeAgentRepo({ db, userId, clock })
  const conversations = makeConversationRepo({ db, userId, clock, genId })
  const chat = makeChatRepo({ db, userId, clock, genId })
  const aiConfig = makeAiConfigRepo({ db, userId, clock })
  const aiErrors = makeAiErrorRepo({ db, userId, clock, genId })
  const collaborators = makeCollaboratorRepo({ db, userId, clock, genId })
  const projects = makeProjectRepo({ db, userId })

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

  const collab = buildCollabApp(deps)
  const social = buildSocialApp({ db, publish, nowIso, genId, clock })

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
    collaborators,
    social: social as unknown as NonNullable<ChatAppDeps['social']>,
    clock,
  }
  return makeChatApp(chatDeps)
}
