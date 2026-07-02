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
  chat: (message) => req('POST', '/chat', { message }),
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
  testAiConfig: (draft) => req('POST', '/ai/test', draft || {}),
}

function toQuery(params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return qs ? `?${qs}` : ''
}

export { req }
