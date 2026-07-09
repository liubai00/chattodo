// src/lib/api.js 的类型声明（旁挂，不改运行时文件）。
// Phase 3 新 TS 代码 `import { api } from '@/lib/api'` 即得类型；旧 App.vue 仍 import './lib/api.js' 不受影响。
import type {
  User, Settings, Agent, AiConfig, Task, Subtask, Comment, TaskDetail,
  Idea, NonTodo, Conversation, Message, ChatResponse,
  Friend, FriendLists, Invite, Notification, Project, TeamUser, AutoRule, SearchResult,
} from '@/types/api'

export function setToken(t: string | null | undefined): void
export function getToken(): string

export interface ChatStreamHandlers {
  onStatus?: (s: { intent?: string }) => void
  onDelta?: (text: string) => void
}

export interface ServerEvent {
  event: string
  [k: string]: unknown
}

export interface ApiClient {
  register(name: string, email: string, password: string): Promise<User>
  login(email: string, password: string): Promise<{ token: string; user?: User }>
  logout(): Promise<null>
  me(): Promise<User>
  updateMe(patch: Partial<User>): Promise<User>
  changePassword(oldPassword: string, newPassword: string): Promise<unknown>

  exportData(): Promise<unknown>
  clearData(): Promise<unknown>
  adminOverview(): Promise<{ users: unknown[]; records: unknown[]; [k: string]: unknown }>
  adminUser(id: string): Promise<unknown>

  getState(): Promise<unknown>
  capture(text: string, source?: string): Promise<Task | Idea | NonTodo>
  chat(message: string, mentions?: string[], conversationId?: string | null): Promise<ChatResponse>
  plan(blockMinutes?: number): Promise<{ items?: unknown[]; [k: string]: unknown }>

  listTasks(params?: Record<string, unknown>): Promise<Task[]>
  createTask(data: Partial<Task>): Promise<Task>
  getTask(id: string): Promise<Task>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  taskDone(id: string): Promise<Task>
  taskReopen(id: string): Promise<Task>
  taskMoveOut(id: string): Promise<unknown>
  deleteTask(id: string): Promise<null>
  getTaskDetail(id: string): Promise<TaskDetail>
  addSubtask(id: string, text: string): Promise<Subtask>
  toggleSubtask(id: string): Promise<Subtask>
  addComment(id: string, text: string, author: string): Promise<Comment>

  ideaConvert(id: string): Promise<unknown>
  ideaArchive(id: string): Promise<unknown>
  ideaDiscard(id: string): Promise<unknown>
  nonToTodo(id: string): Promise<unknown>
  nonDiscard(id: string): Promise<unknown>

  getAgent(): Promise<Agent>
  updateAgent(patch: Partial<Agent>): Promise<Agent>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>

  search(q: string): Promise<SearchResult[]>
  mentions(q: string): Promise<User[]>

  notifications(): Promise<Notification[]>
  markAllNotificationsRead(): Promise<null>

  getAiConfig(): Promise<AiConfig>
  updateAiConfig(patch: Partial<AiConfig>): Promise<AiConfig>
  updateOwnAiConfig(patch: Partial<AiConfig>): Promise<AiConfig>
  clearOwnAiConfig(): Promise<null>
  testAiConfig(draft?: Partial<AiConfig>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }>

  createProject(name: string, description: string): Promise<Project>
  team(): Promise<{ users: TeamUser[] }>
  commitPlan(items: unknown[]): Promise<unknown>

  conversations(): Promise<{ conversations: Conversation[] }>
  createConversation(title?: string): Promise<Conversation>
  conversationMessages(id: string): Promise<Message[]>
  renameConversation(id: string, title: string): Promise<Conversation>
  deleteConversation(id: string): Promise<null>

  friends(): Promise<FriendLists>
  friendRequest(email: string): Promise<unknown>
  friendRespond(id: string, accept: boolean): Promise<unknown>
  friendRemove(id: string): Promise<null>

  inviteCollab(taskId: string, userId: string, force?: boolean): Promise<unknown>
  myInvites(): Promise<Invite[]>
  respondInvite(id: string, mode: boolean | 'accept' | 'decline' | 'follow', remind?: boolean): Promise<unknown>
  leaveTask(taskId: string): Promise<null>
  autoRules(): Promise<{ rules: AutoRule[] }>
  deleteAutoRule(id: string): Promise<null>

  chatStream(
    message: string,
    handlers: ChatStreamHandlers,
    mentions?: string[],
    conversationId?: string | null,
  ): Promise<ChatResponse>
  subscribeEvents(onEvent: (e: ServerEvent) => void): () => void
}

export const api: ApiClient
export function req<T = unknown>(method: string, path: string, body?: unknown): Promise<T>
