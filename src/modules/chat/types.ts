// 聊天域类型：消息 / feed / 任务·想法·非todo 视图模型 / 后端原始行 / 流式载荷 / 视图 props。
// 取代旧 ChatView 内联的 any 接口，强类型贯穿 composable + 组件。
import type { Ref } from 'vue'
import type { Workspace } from '@/shared/enums/workspace'
import type { TaskStatus } from '@/shared/enums/task-status'
import type { TeamUser } from '@/types/api'

// work / personal / mixed（隐私过滤用）。
export type Scope = Workspace | 'mixed'

export interface MsgChip { i: string; t: string }
export interface PlanItem { n: number; t: string; d: string; id?: string; m?: number }

// 渲染用消息（user / ai / sys + 各类卡片）。chips / plan 强类型替代旧 any[]。
export interface RawMsg {
  id: string
  role: string
  kind?: string
  text?: string
  title?: string
  reason?: string
  suggest?: string
  chips?: MsgChip[]
  refId?: string | null
  refType?: string | null
  refs?: string[]
  time?: string
  isErr?: boolean
  streaming?: boolean
  errType?: string
  retryText?: string
  planTitle?: string
  planSub?: string
  planNote?: string
  plan?: PlanItem[]
  committed?: boolean
  retrying?: boolean
  intent?: string
}

export interface FeedItem { id: string; kind: string; title: string; time: string; refId: string }

export interface TaskLite {
  id: string; title: string; status: TaskStatus; project: string; due: string
  priority: number; scope: Scope; assignee: string | null; collabFrom: string | null; today: boolean
}
export interface IdeaLite { id: string; title: string; reason: string; suggest: string; scope: Scope }
export interface NonLite { id: string; title: string; reason: string; scope: Scope }

// ---- 后端原始行（mapXxx 输入）----
export interface RawTaskRow {
  id: string; title: string; status: TaskStatus
  projectId?: string | null; dueAt?: string | null
  priority?: number; privacyScope?: string
  assignee?: string | null; collabFrom?: string | null
  today?: boolean; createdAt?: string
}
export interface RawIdeaRow {
  id: string; title: string
  aiReason?: string; suggestedNextAction?: string
  privacyScope?: string; status?: string; createdAt?: string
}
export interface RawNonRow {
  id: string; title: string; reason?: string
  privacyScope?: string; createdAt?: string
}
export interface RawMsgRow {
  id: string; role: string; text?: string
  refType?: string | null; refId?: string | null
  isError?: boolean; createdAt?: string
}
export interface ChatConversation { id: string; title?: string; lastText?: string; updatedAt?: string }

// 今日待办胶囊拉取的行（listTasks?view=today 的真实形状，含 plannedAt）。
export interface TodayRow {
  id: string; title: string; status: string
  dueAt?: string | null; plannedAt?: string | null
  priority?: number; collabFrom?: string | null
}

// ---- getState 返回的全量状态（聊天视图首屏用到的字段）----
export interface ChatState {
  tasks?: RawTaskRow[]
  todoIdeas?: RawIdeaRow[]
  nonTodoOutputs?: RawNonRow[]
  conversations?: ChatConversation[]
  activeConversationId?: string | null
  chat?: RawMsgRow[]
  [k: string]: unknown
}

// ---- chat / chatStream 响应里的分诊结果（entities / performed / plan）----
export interface ChatEntity {
  type: string
  entity: RawTaskRow | RawIdeaRow | RawNonRow
  result?: { reason?: string }
}
export interface ChatPerformed {
  type: string
  task?: RawTaskRow
  id?: string
  ideaId?: string
  auto?: boolean
  rule?: string
  userName?: string
}
export interface ChatPlanItem { task: { id: string; title: string }; minutes?: number }

// ---- @提及候选 / 已收集提及 / 待引用文档 ----
export interface MentionCandidate {
  kind: 'person' | 'time' | 'doc'
  type: string
  label: string
  userId?: string
  iso?: string
  insert?: string
  entityType?: string
  id?: string
}
export interface Mention {
  type: 'person' | 'time' | 'doc'
  label: string
  userId?: string
  iso?: string
  entityType?: string
  id?: string
}
export interface PendingRef { type: string; id: string; label: string }

// ---- 组件呈现用的视图模型（携带动作闭包，模板零 emit 即可调）----
export interface MessageItem extends RawMsg {
  isSys: boolean; isUser: boolean; isAgentText: boolean
  isTask: boolean; isIdea: boolean; isNono: boolean; isPlan: boolean; isError: boolean
  hasRefs: boolean; isErr: boolean
  open: () => void; openRef: () => void
  undo: () => void; commitPlan: () => void; retry: () => void
}
export interface ConversationItem {
  id: string; title: string; preview: string; time: string
  active: boolean; open: () => void; remove: () => void
}
export interface FeedListItem {
  id: string; kind: string; title: string; time: string; refId: string
  label: string; dot: string; textColor: string; open: () => void
}
export interface TodayListItem {
  title: string; progress: string; done: boolean; dot: string; open: () => void
}
export interface MentionItem {
  label: string; icon: string; typeLabel: string
  groupHead: string | null; bg: string; pick: () => void
}

// ---- 视图 props（与 AppShell 传入契约一致，行为不变）----
export interface ChatProps {
  workspace: Workspace
  privacy: boolean
  openTask: (id: string) => void
  openIdea: (id: string) => void
  openNon: (id: string) => void
  afterSend: () => void
  setWorkspace: (ws: Workspace) => void
  togglePrivacy: () => void
  isMobile?: boolean
}

// 跨子 composable 共享的上下文：由 useChat 门面创建，各子 composable 读写同一份 ref。
export interface ChatCtx {
  props: ChatProps
  notify: (m: string) => void
  rawMessages: Ref<RawMsg[]>
  tasks: Ref<TaskLite[]>
  ideas: Ref<IdeaLite[]>
  nonTodos: Ref<NonLite[]>
  feed: Ref<FeedItem[]>
  activeConversationId: Ref<string | null>
  conversations: Ref<ChatConversation[]>
  myName: Ref<string>
  team: Ref<TeamUser[]>
  canEdit: Ref<boolean>
  showList: Ref<boolean>
}
