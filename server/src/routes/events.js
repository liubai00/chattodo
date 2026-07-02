import { subscribe } from '../services/events.js'

// GET /api/events — long-lived SSE channel for realtime pushes (invites,
// receipts, shared-task updates). Heartbeat every 25s keeps proxies happy.
export default async function eventRoutes(app) {
  app.get('/api/events', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    reply.raw.write(`event: hello\ndata: {"ok":true}\n\n`)
    const unsubscribe = subscribe(req.user.id, reply.raw)
    const heartbeat = setInterval(() => { try { reply.raw.write(`: ping\n\n`) } catch { /* closed */ } }, 25000)
    const cleanup = () => { clearInterval(heartbeat); unsubscribe(); try { reply.raw.end() } catch { /* already closed */ } }
    req.raw.on('close', cleanup)
    req.raw.on('error', cleanup)
  })
}
