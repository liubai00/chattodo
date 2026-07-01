import { chat } from '../services/chat.js'

// POST /api/chat { message } — one chat turn.
export default async function chatRoutes(app) {
  const { repos } = app
  app.post('/api/chat', async (req, reply) => {
    const { message } = req.body || {}
    if (!message || !String(message).trim()) return reply.status(400).send({ error: 'message is required' })
    return chat(repos, { message: String(message) })
  })
}
