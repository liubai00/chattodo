import { chat } from '../services/chat.js'
import { isLimited } from '../lib/rateLimit.js'

// 聊天限流：每登录用户 40 次/分钟，防刷爆第三方模型额度（未登录/测试模式不限）。
const CHAT_MAX = 40
const CHAT_WINDOW = 60000
function chatLimited(req) {
  return req.user ? isLimited(`chat:${req.user.id}`, CHAT_MAX, CHAT_WINDOW) : false
}

// POST /api/chat { message } — one chat turn (single JSON response).
// POST /api/chat/stream — same turn as Server-Sent Events:
//   event:status {intent} → event:delta {text}… → event:done {full payload} | event:error
export default async function chatRoutes(app) {
  app.post('/api/chat', async (req, reply) => {
    const { message } = req.body || {}
    if (!message || !String(message).trim()) return reply.status(400).send({ error: 'message is required' })
    if (chatLimited(req)) return reply.status(429).send({ error: '消息太频繁了，休息一下再发～' })
    return chat(req.repos, { message: String(message), db: app.db, user: req.user })
  })

  app.post('/api/chat/stream', async (req, reply) => {
    const { message } = req.body || {}
    if (!message || !String(message).trim()) return reply.status(400).send({ error: 'message is required' })
    if (chatLimited(req)) return reply.status(429).send({ error: '消息太频繁了，休息一下再发～' })
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // tell nginx not to buffer this response
    })
    const send = (event, data) => { try { reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch { /* client gone */ } }
    try {
      const result = await chat(req.repos, {
        message: String(message),
        db: app.db,
        user: req.user,
        onEvent: (e) => {
          if (e.type === 'delta') send('delta', { text: e.text })
          else if (e.type === 'status') send('status', { intent: e.intent })
        },
      })
      send('done', result)
    } catch (err) {
      send('error', { error: err.message || '处理失败' })
    }
    reply.raw.end()
  })
}
