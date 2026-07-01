// Thin client for the Chattodo backend.
// Dev: relative '/api' via the Vite proxy. Prod (e.g. /todo/): set VITE_API_BASE at build.
const BASE = import.meta.env.VITE_API_BASE || '/api'

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const getState = () => req('GET', '/state')
export const capture = (text, source = 'web') => req('POST', '/capture', { text, source })
export const chat = (message) => req('POST', '/chat', { message })
export const plan = (blockMinutes) => req('POST', '/plan', blockMinutes ? { blockMinutes } : {})

export const taskCreate = (data) => req('POST', '/tasks', data)
export const taskDetail = (id) => req('GET', `/tasks/${id}`)
export const taskUpdate = (id, patch) => req('PATCH', `/tasks/${id}`, patch)
export const taskDone = (id) => req('POST', `/tasks/${id}/done`)
export const taskReopen = (id) => req('POST', `/tasks/${id}/reopen`)
export const taskMoveOut = (id) => req('POST', `/tasks/${id}/move-out`)

export const ideaConvert = (id) => req('POST', `/todo-ideas/${id}/convert`)
export const ideaArchive = (id) => req('POST', `/todo-ideas/${id}/archive`)
export const ideaDiscard = (id) => req('POST', `/todo-ideas/${id}/discard`)

export const nonToTodo = (id) => req('POST', `/non-todo-outputs/${id}/convert-to-todo`)
export const nonDiscard = (id) => req('POST', `/non-todo-outputs/${id}/discard`)

export const updateAgent = (patch) => req('PUT', '/agent', patch)
export const updateSettings = (patch) => req('PUT', '/settings', patch)

export const search = (q) => req('GET', `/search?q=${encodeURIComponent(q || '')}`)
export const mentions = (q) => req('GET', `/mentions?q=${encodeURIComponent(q || '')}`)

export const getAiConfig = () => req('GET', '/ai/config')
export const updateAiConfig = (patch) => req('PUT', '/ai/config', patch)
export const testAiConfig = (draft) => req('POST', '/ai/test', draft || {})
