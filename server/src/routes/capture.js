import { capture } from '../services/capture.js'

// POST /api/capture { text, source } — triage + route + record.
export default async function captureRoutes(app) {
  app.post('/api/capture', async (req, reply) => {
    const { text, source } = req.body || {}
    if (!text || !String(text).trim()) {
      return reply.status(400).send({ error: 'text is required' })
    }
    return capture(app.repos, { text: String(text), source: source || 'web' })
  })
}
