// Framework-agnostic client for the Chattodo backend.
// Dev: relative '/api' via the Vite proxy. Prod (/todo/): set VITE_API_BASE at build.
import type {
  User, Settings, Agent, AiConfig, Task, Subtask, Comment, TaskDetail,
  Idea, NonTodo, Conversation, Message, ChatResponse,
  Friend, FriendLists, Invite, Notification, Project, TeamUser, AutoRule, SearchResult,
} from '@/types/api'

const BASE = import.meta.env.VITE_API_BASE || '/api'

let TOKEN = ''
try { TOKEN = localStorage.getItem('lx_token') || '' } catch { /* ignore */ }

export function setToken(t: string | null | undefined): void {
  TOKEN = t || ''
  try {
    if (TOKEN) localStorage.setItem('lx_token', TOKEN)
    else localStorage.removeItem('lx_token')
  } catch { /* ignore */ }
}
export function getToken(): string { return TOKEN }

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

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error || msg } catch { /* ignore */ }
    const err = new Error(msg) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return (res.status === 204 ? null : await res.json()) as T
}

export const api: ApiClient = {
  register: (name, email, password) => req<User>('POST', '/auth/register', { name, email, password }),
  login: (email, password) => req<{ token: string; user?: User }>('POST', '/auth/login', { email, password }),
  logout: () => req<null>('POST', '/auth/logout'),
  me: () => req<User>('GET', '/auth/me'),
  updateMe: (patch) => req<User>('PATCH', '/auth/me', patch),
  changePassword: (oldPassword, newPassword) => req<unknown>('POST', '/auth/password', { oldPassword, newPassword }),

  exportData: () => req<unknown>('GET', '/export'),
  clearData: () => req<unknown>('POST', '/data/clear'),
  adminOverview: () => req<{ users: unknown[]; records: unknown[]; [k: string]: unknown }>('GET', '/admin/overview'),
  adminUser: (id) => req<unknown>('GET', `/admin/users/${id}`),

  getState: () => req<unknown>('GET', '/state'),
  capture: (text, source = 'chat') => req<Task | Idea | NonTodo>('POST', '/capture', { text, source }),
  chat: (message, mentions, conversationId) => req<ChatResponse>('POST', '/chat', { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }),
  chatStream,
  plan: (blockMinutes) => req<{ items?: unknown[]; [k: string]: unknown }>('POST', '/plan', blockMinutes ? { blockMinutes } : {}),

  listTasks: (params = {}) => req<Task[]>('GET', '/tasks' + toQuery(params)),
  createTask: (data) => req<Task>('POST', '/tasks', data),
  getTask: (id) => req<Task>('GET', `/tasks/${id}`),
  updateTask: (id, patch) => req<Task>('PATCH', `/tasks/${id}`, patch),
  taskDone: (id) => req<Task>('POST', `/tasks/${id}/done`),
  taskReopen: (id) => req<Task>('POST', `/tasks/${id}/reopen`),
  taskMoveOut: (id) => req<unknown>('POST', `/tasks/${id}/move-out`),
  deleteTask: (id) => req<null>('DELETE', `/tasks/${id}`),
  getTaskDetail: (id) => req<TaskDetail>('GET', `/tasks/${id}/detail`),
  addSubtask: (id, text) => req<Subtask>('POST', `/tasks/${id}/subtasks`, { text }),
  toggleSubtask: (id) => req<Subtask>('PATCH', `/subtasks/${id}`),
  addComment: (id, text, author) => req<Comment>('POST', `/tasks/${id}/comments`, { text, author }),

  ideaConvert: (id) => req<unknown>('POST', `/todo-ideas/${id}/convert`),
  ideaArchive: (id) => req<unknown>('POST', `/todo-ideas/${id}/archive`),
  ideaDiscard: (id) => req<unknown>('POST', `/todo-ideas/${id}/discard`),

  nonToTodo: (id) => req<unknown>('POST', `/non-todo-outputs/${id}/convert-to-todo`),
  nonDiscard: (id) => req<unknown>('POST', `/non-todo-outputs/${id}/discard`),

  getAgent: () => req<Agent>('GET', '/agent'),
  updateAgent: (patch) => req<Agent>('PUT', '/agent', patch),
  getSettings: () => req<Settings>('GET', '/settings'),
  updateSettings: (patch) => req<Settings>('PUT', '/settings', patch),

  search: (q) => req<SearchResult[]>('GET', `/search?q=${encodeURIComponent(q || '')}`),
  mentions: (q) => req<User[]>('GET', `/mentions?q=${encodeURIComponent(q || '')}`),

  notifications: () => req<Notification[]>('GET', '/notifications'),
  markAllNotificationsRead: () => req<null>('POST', '/notifications/read-all'),

  getAiConfig: () => req<AiConfig>('GET', '/ai/config'),
  updateAiConfig: (patch) => req<AiConfig>('PUT', '/ai/config', patch),
  updateOwnAiConfig: (patch) => req<AiConfig>('PUT', '/ai/config/own', patch),
  clearOwnAiConfig: () => req<null>('DELETE', '/ai/config/own'),
  testAiConfig: (draft) => req<{ ok: boolean; error?: string; [k: string]: unknown }>('POST', '/ai/test', draft || {}),

  createProject: (name, description) => req<Project>('POST', '/projects', { name, description }),
  team: () => req<{ users: TeamUser[] }>('GET', '/team'),
  commitPlan: (items) => req<unknown>('POST', '/plan/commit', { items }),

  conversations: () => req<{ conversations: Conversation[] }>('GET', '/conversations'),
  createConversation: (title) => req<Conversation>('POST', '/conversations', title ? { title } : {}),
  conversationMessages: (id) => req<Message[]>(`GET`, `/conversations/${id}/messages`),
  renameConversation: (id, title) => req<Conversation>('PATCH', `/conversations/${id}`, { title }),
  deleteConversation: (id) => req<null>('DELETE', `/conversations/${id}`),

  friends: () => req<FriendLists>('GET', '/friends'),
  friendRequest: (email) => req<unknown>('POST', '/friends/request', { email }),
  friendRespond: (id, accept) => req<unknown>('POST', `/friends/${id}/respond`, { accept }),
  friendRemove: (id) => req<null>('DELETE', `/friends/${id}`),

  inviteCollab: (taskId, userId, force) => req<unknown>('POST', `/tasks/${taskId}/invite`, force ? { userId, force: true } : { userId }),
  myInvites: () => req<Invite[]>('GET', '/invites'),
  // mode: true/'accept' | false/'decline' | 'follow'（仅关注）
  respondInvite: (id, mode, remind = true) => req<unknown>('POST', `/invites/${id}/respond`, mode === 'follow' ? { follow: true, remind } : { accept: mode === true || mode === 'accept', remind }),
  leaveTask: (taskId) => req<null>('POST', `/tasks/${taskId}/leave`),
  autoRules: () => req<{ rules: AutoRule[] }>('GET', '/auto-rules'),
  deleteAutoRule: (id) => req<null>('DELETE', `/auto-rules/${id}`),
  subscribeEvents,
}

// Streaming chat turn over SSE. handlers: {onStatus({intent}), onDelta(text)}.
// Resolves with the final full payload (same shape as api.chat); throws if the
// stream is unavailable or breaks before `done` - caller falls back to api.chat.
async function chatStream(message: string, handlers: ChatStreamHandlers = {}, mentions: string[] = [], conversationId: string | null = null): Promise<ChatResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  const body = { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }
  const res = await fetch(BASE + '/chat/stream', { method: 'POST', headers, body: JSON.stringify(body) })
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
        if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
        const res = await fetch(BASE + '/events', { headers, signal: ctrl.signal })
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

export { req }
