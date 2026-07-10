// Framework-agnostic client for the Chattodo backend.
// Dev: relative '/api' via the Vite proxy. Prod (/todo/): set VITE_API_BASE at build.
//
// P10-1：底层 HTTP（token / fetch / JSON / 错误）已抽到 @/infrastructure/request。
// 本文件保留：api 聚合对象、流式 chatStream、SSE subscribeEvents，以及 setToken/getToken/req
// 的 re-export，维持 `import { api } from '@/lib/api'` 等旧路径零破坏（admin/ 仍用相对路径引入）。
import type {
  User, Settings, Agent, AiConfig, Task, Subtask, Comment, TaskDetail,
  Idea, NonTodo, Conversation, Message, ChatResponse,
  Friend, FriendLists, Invite, Notification, Project, TeamUser, AutoRule, SearchResult,
} from '@/types/api'
import { request, apiUrl, getToken, setToken } from '@/infrastructure/request'

// 旧路径兼容：setToken / getToken / req 仍可从 '@/lib/api' 直接导入。
export { setToken, getToken }
export { request as req }

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

export const api: ApiClient = {
  register: (name, email, password) => request<User>('POST', '/auth/register', { name, email, password }),
  login: (email, password) => request<{ token: string; user?: User }>('POST', '/auth/login', { email, password }),
  logout: () => request<null>('POST', '/auth/logout'),
  me: () => request<User>('GET', '/auth/me'),
  updateMe: (patch) => request<User>('PATCH', '/auth/me', patch),
  changePassword: (oldPassword, newPassword) => request<unknown>('POST', '/auth/password', { oldPassword, newPassword }),

  exportData: () => request<unknown>('GET', '/export'),
  clearData: () => request<unknown>('POST', '/data/clear'),
  adminOverview: () => request<{ users: unknown[]; records: unknown[]; [k: string]: unknown }>('GET', '/admin/overview'),
  adminUser: (id) => request<unknown>('GET', `/admin/users/${id}`),

  getState: () => request<unknown>('GET', '/state'),
  capture: (text, source = 'chat') => request<Task | Idea | NonTodo>('POST', '/capture', { text, source }),
  chat: (message, mentions, conversationId) => request<ChatResponse>('POST', '/chat', { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }),
  chatStream,
  plan: (blockMinutes) => request<{ items?: unknown[]; [k: string]: unknown }>('POST', '/plan', blockMinutes ? { blockMinutes } : {}),

  listTasks: (params = {}) => request<Task[]>('GET', '/tasks' + toQuery(params)),
  createTask: (data) => request<Task>('POST', '/tasks', data),
  getTask: (id) => request<Task>('GET', `/tasks/${id}`),
  updateTask: (id, patch) => request<Task>('PATCH', `/tasks/${id}`, patch),
  taskDone: (id) => request<Task>('POST', `/tasks/${id}/done`),
  taskReopen: (id) => request<Task>('POST', `/tasks/${id}/reopen`),
  taskMoveOut: (id) => request<unknown>('POST', `/tasks/${id}/move-out`),
  deleteTask: (id) => request<null>('DELETE', `/tasks/${id}`),
  getTaskDetail: (id) => request<TaskDetail>('GET', `/tasks/${id}/detail`),
  addSubtask: (id, text) => request<Subtask>('POST', `/tasks/${id}/subtasks`, { text }),
  toggleSubtask: (id) => request<Subtask>('PATCH', `/subtasks/${id}`),
  addComment: (id, text, author) => request<Comment>('POST', `/tasks/${id}/comments`, { text, author }),

  ideaConvert: (id) => request<unknown>('POST', `/todo-ideas/${id}/convert`),
  ideaArchive: (id) => request<unknown>('POST', `/todo-ideas/${id}/archive`),
  ideaDiscard: (id) => request<unknown>('POST', `/todo-ideas/${id}/discard`),

  nonToTodo: (id) => request<unknown>('POST', `/non-todo-outputs/${id}/convert-to-todo`),
  nonDiscard: (id) => request<unknown>('POST', `/non-todo-outputs/${id}/discard`),

  getAgent: () => request<Agent>('GET', '/agent'),
  updateAgent: (patch) => request<Agent>('PUT', '/agent', patch),
  getSettings: () => request<Settings>('GET', '/settings'),
  updateSettings: (patch) => request<Settings>('PUT', '/settings', patch),

  search: (q) => request<SearchResult[]>('GET', `/search?q=${encodeURIComponent(q || '')}`),
  mentions: (q) => request<User[]>('GET', `/mentions?q=${encodeURIComponent(q || '')}`),

  notifications: () => request<Notification[]>('GET', '/notifications'),
  markAllNotificationsRead: () => request<null>('POST', '/notifications/read-all'),

  getAiConfig: () => request<AiConfig>('GET', '/ai/config'),
  updateAiConfig: (patch) => request<AiConfig>('PUT', '/ai/config', patch),
  updateOwnAiConfig: (patch) => request<AiConfig>('PUT', '/ai/config/own', patch),
  clearOwnAiConfig: () => request<null>('DELETE', '/ai/config/own'),
  testAiConfig: (draft) => request<{ ok: boolean; error?: string; [k: string]: unknown }>('POST', '/ai/test', draft || {}),

  createProject: (name, description) => request<Project>('POST', '/projects', { name, description }),
  team: () => request<{ users: TeamUser[] }>('GET', '/team'),
  commitPlan: (items) => request<unknown>('POST', '/plan/commit', { items }),

  conversations: () => request<{ conversations: Conversation[] }>('GET', '/conversations'),
  createConversation: (title) => request<Conversation>('POST', '/conversations', title ? { title } : {}),
  conversationMessages: (id) => request<Message[]>(`GET`, `/conversations/${id}/messages`),
  renameConversation: (id, title) => request<Conversation>('PATCH', `/conversations/${id}`, { title }),
  deleteConversation: (id) => request<null>('DELETE', `/conversations/${id}`),

  friends: () => request<FriendLists>('GET', '/friends'),
  friendRequest: (email) => request<unknown>('POST', '/friends/request', { email }),
  friendRespond: (id, accept) => request<unknown>('POST', `/friends/${id}/respond`, { accept }),
  friendRemove: (id) => request<null>('DELETE', `/friends/${id}`),

  inviteCollab: (taskId, userId, force) => request<unknown>('POST', `/tasks/${taskId}/invite`, force ? { userId, force: true } : { userId }),
  myInvites: () => request<Invite[]>('GET', '/invites'),
  // mode: true/'accept' | false/'decline' | 'follow'（仅关注）
  respondInvite: (id, mode, remind = true) => request<unknown>('POST', `/invites/${id}/respond`, mode === 'follow' ? { follow: true, remind } : { accept: mode === true || mode === 'accept', remind }),
  leaveTask: (taskId) => request<null>('POST', `/tasks/${taskId}/leave`),
  autoRules: () => request<{ rules: AutoRule[] }>('GET', '/auto-rules'),
  deleteAutoRule: (id) => request<null>('DELETE', `/auto-rules/${id}`),
  subscribeEvents,
}

// Streaming chat turn over SSE. handlers: {onStatus({intent}), onDelta(text)}.
// Resolves with the final full payload (same shape as api.chat); throws if the
// stream is unavailable or breaks before `done` - caller falls back to api.chat.
async function chatStream(message: string, handlers: ChatStreamHandlers = {}, mentions: string[] = [], conversationId: string | null = null): Promise<ChatResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = getToken()
  if (token) headers.authorization = 'Bearer ' + token
  const body = { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }
  const res = await fetch(apiUrl + '/chat/stream', { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok || !res.body || !res.body.getReader) {
    const err = new Error('stream unavailable') as Error & { status: number }
    err.status = res.status
    throw err
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let carry = ''
  let done: ChatResponse | null = null
  for (;;) {
    const { done: end, value } = await reader.read()
    if (end) break
    carry += dec.decode(value, { stream: true })
    const blocks = carry.split('\n\n')
    carry = blocks.pop()!
    for (const block of blocks) {
      let event = 'message'; let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      let obj: unknown = null
      try { obj = JSON.parse(data) } catch { /* ignore */ }
      if (event === 'delta') handlers.onDelta && handlers.onDelta((obj as { text?: string } | null)?.text || '')
      else if (event === 'status') handlers.onStatus && handlers.onStatus((obj as { intent?: string } | null) || {})
      else if (event === 'done') done = obj as ChatResponse
      else if (event === 'error') throw new Error((obj as { error?: string } | null)?.error || '流式请求失败')
    }
  }
  if (!done) throw new Error('流式响应中断')
  return done
}

// 实时事件通道（SSE）：断线 5s 自动重连；返回 stop() 用于登出时中止。
function subscribeEvents(onEvent: (e: ServerEvent) => void): () => void {
  let stop = false
  let ctrl: AbortController | null = null
  const run = async () => {
    while (!stop) {
      try {
        ctrl = new AbortController()
        const headers: Record<string, string> = {}
        const token = getToken()
        if (token) headers.authorization = 'Bearer ' + token
        const res = await fetch(apiUrl + '/events', { headers, signal: ctrl.signal })
        if (!res.ok || !res.body || !res.body.getReader) throw new Error('events unavailable')
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let carry = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          carry += dec.decode(value, { stream: true })
          const blocks = carry.split('\n\n')
          carry = blocks.pop()!
          for (const block of blocks) {
            let event = 'message'; let data = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (event === 'hello' || !data) continue
            try { const obj = JSON.parse(data) as ServerEvent; if (obj && onEvent && !stop) onEvent(obj) } catch { /* ignore */ }
          }
        }
      } catch { /* retry below */ }
      if (!stop) await new Promise((r) => setTimeout(r, 5000))
    }
  }
  run()
  return () => { stop = true; try { ctrl && ctrl.abort() } catch { /* ignore */ } }
}

function toQuery(params: Record<string, unknown>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&')
  return qs ? `?${qs}` : ''
}
