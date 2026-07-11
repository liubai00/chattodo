// 聊天域 API：发送（普通 + 流式 SSE）/ 会话 CRUD / 实时事件订阅。
// chatStream 与 subscribeEvents 为 SSE 流式实现，复用 infrastructure 的 apiUrl / getToken。
import { request, apiUrl, getToken } from '@/infrastructure/request'
import type { ChatResponse, Conversation, Message } from '@/types/api'

export interface ChatStreamHandlers {
  onStatus?: (s: { intent?: string }) => void
  onDelta?: (text: string) => void
}

export interface ServerEvent {
  event: string
  [k: string]: unknown
}

// Streaming chat turn over SSE. handlers: {onStatus({intent}), onDelta(text)}.
// Resolves with the final full payload (same shape as api.chat); throws if the
// stream is unavailable or breaks before `done` - caller falls back to api.chat.
async function chatStream(message: string, handlers: ChatStreamHandlers = {}, mentions: unknown[] = [], conversationId: string | null = null): Promise<ChatResponse> {
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

export const ChatAPI = {
  chat: (message: string, mentions?: unknown[], conversationId?: string | null) => request<ChatResponse>('POST', '/chat', { message, ...(mentions && mentions.length ? { mentions } : {}), ...(conversationId ? { conversationId } : {}) }),
  chatStream,
  conversations: () => request<{ conversations: Conversation[] }>('GET', '/conversations'),
  createConversation: (title?: string) => request<Conversation>('POST', '/conversations', title ? { title } : {}),
  conversationMessages: (id: string) => request<Message[]>(`GET`, `/conversations/${id}/messages`),
  renameConversation: (id: string, title: string) => request<Conversation>('PATCH', `/conversations/${id}`, { title }),
  deleteConversation: (id: string) => request<null>('DELETE', `/conversations/${id}`),
  subscribeEvents,
}
