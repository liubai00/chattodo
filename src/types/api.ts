// API 实体类型。基于旧 App.vue 的字段使用推断；Phase 3 迁移各视图时按需补全/修正。
// 未确定的字段标 optional；访问到未声明字段时再补，避免现在过度臆断。

import type { TaskStatus } from '@/shared/enums/task-status'
import type { Workspace } from '@/shared/enums/workspace'
export type { TaskStatus, Workspace }
export type Role = 'admin' | 'member' | 'viewer'

export interface User {
  id: string
  name: string
  accountName?: string
  email: string
  role: Role
}

export interface NotifPrefs {
  assign: boolean
  due: boolean
  fail: boolean
  done: boolean
}

export interface Settings {
  name: string
  accountName: string
  email: string
  apiKey: string
  aiTested: boolean
  theme?: 'light' | 'dark'
  defaultWs: Workspace
  defaultView: string
  aiVisibility: string
  privacyDefault: boolean
  friendPolicy: 'open' | 'closed'
  notifPrefs: NotifPrefs
  aiPreset: string
  aiProvider: string
  aiBaseUrl: string
  aiModel: string
  aiHasKey: boolean
  aiFallback: boolean
}

export interface Agent {
  soul: string
  memory: string
  preferences: string
  workingStyle: string
  privacyRules: string
  followup: string
}

export interface AiConfig {
  provider?: string
  baseUrl?: string
  model?: string
  apiKey?: string
  hasKey?: boolean
  fallbackToRule?: boolean
  source?: 'team' | 'own'
}

export interface Subtask {
  id: string
  text: string
  done: boolean
}

export interface Comment {
  id: string
  text: string
  author: string
  createdAt?: string
}

export interface Task {
  id: string
  title: string
  status: TaskStatus
  today?: boolean
  project?: string
  due?: string | null
  notes?: string
  raw?: string
  reason?: string
  conf?: number
  gen?: string
  edited?: boolean
  collabFrom?: string
  priority?: number
  scope?: Workspace
  assignee?: string
  subtasks?: Subtask[]
  comments?: Comment[]
}

export interface TaskDetail extends Task {
  activity?: Array<{ id?: string; text?: string; type?: string; at?: string }>
  collabs?: User[]
}

export interface Idea {
  id: string
  title: string
  raw?: string
  reason?: string
  suggest?: string
  gen?: string
  scope?: Workspace
}

export interface NonTodo {
  id: string
  title: string
  text?: string
  raw?: string
  reason?: string
  dest?: string
  gen?: string
}

export interface Conversation {
  id: string
  title: string
  updatedAt?: string
}

export interface Message {
  id: string
  role: string
  text: string
  committed?: boolean
  intent?: string
  taskId?: string
}

// chat / chatStream 的最终载荷形状较松（含 AI 分诊结果），用 index signature 兜底。
export interface ChatResponse {
  messages?: Message[]
  tasks?: Task[]
  ideas?: Idea[]
  nonTodos?: NonTodo[]
  intent?: string
  [k: string]: unknown
}

export interface Friend {
  id: string
  name: string
  email: string
  status?: string
}

export interface FriendLists {
  friends: Friend[]
  incoming: Friend[]
  outgoing: Friend[]
}

export interface Invite {
  id: string
  taskId?: string
  taskTitle?: string
  fromName?: string
  fromId?: string
  mode?: string
}

export interface Notification {
  id: string
  type?: string
  text: string
  time?: string
  read?: boolean
  icon?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  status?: string
  color?: string
}

export interface TeamUser extends User {
  taskCount?: number
  ideaCount?: number
  nonCount?: number
  errorCount?: number
}

export interface AutoRule {
  id: string
  keyword: string
  targetName: string
}

export interface SearchResult {
  id: string
  type?: string
  title?: string
  subtitle?: string
  icon?: string
}
