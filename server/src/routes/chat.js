import { chat } from '../services/chat.js'

// POST /api/chat { message } — one chat turn (single JSON response).
// POST /api/chat/stream — same turn as Server-Sent Events:
//   event:status {intent} → event:delta {text}… → event:done {full payload} | event:error
export default async function chatRoutes(app) {
  app.post('/api/chat', async (req, reply) => {
    const { message } = req.body || {}
    if (!message || !String(message).trim()) return reply.status(400).send({ error: 'message is required' })
    return chat(req.repos, { message: String(message), db: app.db, user: req.user })
  })

  app.post('/api/chat/stream', async (req, reply) => {
    const { message } = req.body || {}
    if (!message || !String(message).trim()) return reply.status(400).send({ error: 'message is required' })
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
