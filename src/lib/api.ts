// Framework-agnostic client for the Chattodo backend.
// Dev: relative '/api' via the Vite proxy. Prod (/todo/): set VITE_API_BASE at build.
//
// P10-3：API 已按业务域拆入 @/modules/*/api.ts（AuthAPI / FriendsAPI / ... youlai 风格对象，
// 保留原 api.xxx 方法名以零破坏）。本文件为聚合层：
//   - 拼装出统一 `api` 对象（旧 `import { api } from '@/lib/api'` 不变）；
//   - re-export setToken/getToken/req/ChatStreamHandlers/ServerEvent 供旧路径继续可用
//     （admin/ 仍用相对路径引入本文件）。
// 新代码请直接 import { FriendsAPI } from '@/modules/friends/api' 等。
import type {
  User, Settings, Agent, AiConfig, Task, Subtask, Comment, TaskDetail,
  Idea, NonTodo, Conversation, Message, ChatResponse,
  Friend, FriendLists, Invite, Notification, Project, TeamUser, AutoRule, SearchResult,
} from '@/types/api'
import { AuthAPI } from '@/modules/auth/api'
import { AdminAPI } from '@/modules/admin/api'
import { AppAPI } from '@/modules/app/api'
import { TasksAPI } from '@/modules/tasks/api'
import { ClarifyAPI } from '@/modules/clarify/api'
import { NonTodoAPI } from '@/modules/nontodo/api'
import { AgentAPI } from '@/modules/agent/api'
import { SettingsAPI } from '@/modules/settings/api'
import { ChatAPI } from '@/modules/chat/api'
import type { ChatStreamHandlers, ServerEvent } from '@/modules/chat/api'
import { FriendsAPI } from '@/modules/friends/api'
import { NotificationsAPI } from '@/modules/notifications/api'

// 旧路径兼容：setToken / getToken / req 仍可从 '@/lib/api' 直接导入。
export { getToken, setToken, request as req } from '@/infrastructure/request'
export type { ChatStreamHandlers, ServerEvent }

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
  updateSettings(patch: Record<string, unknown>): Promise<Settings>

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
  // mode: true/'accept' | false/'decline' | 'follow'（仅关注）
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

// 统一 api 对象：由各域 API 对象拼装，方法名与签名与拆分前完全一致（行为不变）。
export const api: ApiClient = {
  ...AuthAPI,
  ...AdminAPI,
  ...AppAPI,
  ...TasksAPI,
  ...ClarifyAPI,
  ...NonTodoAPI,
  ...AgentAPI,
  ...SettingsAPI,
  ...ChatAPI,
  ...FriendsAPI,
  ...NotificationsAPI,
}
