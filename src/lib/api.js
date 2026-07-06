// Framework-agnostic client for the Chattodo backend.
// Dev: relative '/api' via the Vite proxy. Prod (/todo/): set VITE_API_BASE at build.
const BASE = import.meta.env.VITE_API_BASE || '/api'

let TOKEN = ''
try { TOKEN = localStorage.getItem('lx_token') || '' } catch { /* ignore */ }

export function setToken(t) {
  TOKEN = t || ''
  try {
    if (TOKEN) localStorage.setItem('lx_token', TOKEN)
    else localStorage.removeItem('lx_token')
  } catch { /* ignore */ }
}
export function getToken() { return TOKEN }

async function req(method, path, body) {
  const headers = {}
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
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  register: (name, email, password) => req('POST', '/auth/register', { name, email, password }),
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  logout: () => req('POST', '/auth/logout'),
  me: () => req('GET', '/auth/me'),
  updateMe: (patch) => req('PATCH', '/auth/me', patch),
  changePassword: (oldPassword, newPassword) => req('POST', '/auth/password', { oldPassword, newPassword }),

  exportData: () => req('GET', '/export'),
  clearData: () => req('POST', '/data/clear'),
  adminOverview: () => req('GET', '/admin/overview'),
  adminUser: (id) => req('GET', `/admin/users/${id}`),

  getState: () => req('GET', '/state'),
  capture: (text, source = 'chat') => req('POST', '/capture', { text, source }),
  chat: (message, mentions, conversationId) => req('POST', '/chat', { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }),
  chatStream,
  plan: (blockMinutes) => req('POST', '/plan', blockMinutes ? { blockMinutes } : {}),

  listTasks: (params = {}) => req('GET', '/tasks' + toQuery(params)),
  createTask: (data) => req('POST', '/tasks', data),
  getTask: (id) => req('GET', `/tasks/${id}`),
  updateTask: (id, patch) => req('PATCH', `/tasks/${id}`, patch),
  taskDone: (id) => req('POST', `/tasks/${id}/done`),
  taskReopen: (id) => req('POST', `/tasks/${id}/reopen`),
  taskMoveOut: (id) => req('POST', `/tasks/${id}/move-out`),
  deleteTask: (id) => req('DELETE', `/tasks/${id}`),
  getTaskDetail: (id) => req('GET', `/tasks/${id}/detail`),
  addSubtask: (id, text) => req('POST', `/tasks/${id}/subtasks`, { text }),
  toggleSubtask: (id) => req('PATCH', `/subtasks/${id}`),
  addComment: (id, text, author) => req('POST', `/tasks/${id}/comments`, { text, author }),

  ideaConvert: (id) => req('POST', `/todo-ideas/${id}/convert`),
  ideaArchive: (id) => req('POST', `/todo-ideas/${id}/archive`),
  ideaDiscard: (id) => req('POST', `/todo-ideas/${id}/discard`),

  nonToTodo: (id) => req('POST', `/non-todo-outputs/${id}/convert-to-todo`),
  nonDiscard: (id) => req('POST', `/non-todo-outputs/${id}/discard`),

  getAgent: () => req('GET', '/agent'),
  updateAgent: (patch) => req('PUT', '/agent', patch),
  getSettings: () => req('GET', '/settings'),
  updateSettings: (patch) => req('PUT', '/settings', patch),

  search: (q) => req('GET', `/search?q=${encodeURIComponent(q || '')}`),
  mentions: (q) => req('GET', `/mentions?q=${encodeURIComponent(q || '')}`),

  notifications: () => req('GET', '/notifications'),
  markAllNotificationsRead: () => req('POST', '/notifications/read-all'),

  getAiConfig: () => req('GET', '/ai/config'),
  updateAiConfig: (patch) => req('PUT', '/ai/config', patch),
  updateOwnAiConfig: (patch) => req('PUT', '/ai/config/own', patch),
  clearOwnAiConfig: () => req('DELETE', '/ai/config/own'),
  testAiConfig: (draft) => req('POST', '/ai/test', draft || {}),

  createProject: (name, description) => req('POST', '/projects', { name, description }),
  team: () => req('GET', '/team'),
  commitPlan: (items) => req('POST', '/plan/commit', { items }),

  conversations: () => req('GET', '/conversations'),
  createConversation: (title) => req('POST', '/conversations', title ? { title } : {}),
  conversationMessages: (id) => req('GET', `/conversations/${id}/messages`),
  renameConversation: (id, title) => req('PATCH', `/conversations/${id}`, { title }),
  deleteConversation: (id) => req('DELETE', `/conversations/${id}`),

  friends: () => req('GET', '/friends'),
  friendRequest: (email) => req('POST', '/friends/request', { email }),
  friendRespond: (id, accept) => req('POST', `/friends/${id}/respond`, { accept }),
  friendRemove: (id) => req('DELETE', `/friends/${id}`),

  inviteCollab: (taskId, userId, force) => req('POST', `/tasks/${taskId}/invite`, force ? { userId, force: true } : { userId }),
  myInvites: () => req('GET', '/invites'),
  // mode: true/'accept' | false/'decline' | 'follow'（仅关注）
  respondInvite: (id, mode, remind = true) => req('POST', `/invites/${id}/respond`, mode === 'follow' ? { follow: true, remind } : { accept: mode === true || mode === 'accept', remind }),
  leaveTask: (taskId) => req('POST', `/tasks/${taskId}/leave`),
  autoRules: () => req('GET', '/auto-rules'),
  deleteAutoRule: (id) => req('DELETE', `/auto-rules/${id}`),
  subscribeEvents,
}

// Streaming chat turn over SSE. handlers: {onStatus({intent}), onDelta(text)}.
// Resolves with the final full payload (same shape as api.chat); throws if the
// stream is unavailable or breaks before `done` — caller falls back to api.chat.
async function chatStream(message, handlers = {}, mentions = [], conversationId = null) {
  const headers = { 'content-type': 'application/json' }
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  const body = { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }
  const res = await fetch(BASE + '/chat/stream', { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok || !res.body || !res.body.getReader) {
    const err = new Error('stream unavailable'); err.status = res.status; throw err
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let carry = ''
  let done = null
  for (;;) {
    const { done: end, value } = await reader.read()
    if (end) break
    carry += dec.decode(value, { stream: true })
    const blocks = carry.split('\n\n')
    carry = blocks.pop()
    for (const block of blocks) {
      let event = 'message'; let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      let obj = null
      try { obj = JSON.parse(data) } catch { /* ignore */ }
      if (event === 'delta') handlers.onDelta && handlers.onDelta((obj && obj.text) || '')
      else if (event === 'status') handlers.onStatus && handlers.onStatus(obj || {})
      else if (event === 'done') done = obj
      else if (event === 'error') throw new Error((obj && obj.error) || '流式请求失败')
    }
  }
  if (!done) throw new Error('流式响应中断')
  return done
}

// 实时事件通道（SSE）：断线 5s 自动重连；返回 stop() 用于登出时中止。
function subscribeEvents(onEvent) {
  let stop = false
  let ctrl = null
  const run = async () => {
    while (!stop) {
      try {
        ctrl = new AbortController()
        const headers = {}
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
          carry = blocks.pop()
          for (const block of blocks) {
            let event = 'message'; let data = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (event === 'hello' || !data) continue
            try { const obj = JSON.parse(data); if (obj && onEvent && !stop) onEvent(obj) } catch { /* ignore */ }
          }
        }
      } catch { /* retry below */ }
      if (!stop) await new Promise((r) => setTimeout(r, 5000))
    }
  }
  run()
  return () => { stop = true; try { ctrl && ctrl.abort() } catch { /* ignore */ } }
}

function toQuery(params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return qs ? `?${qs}` : ''
}

export { req }
