import { convertIdeaToTask } from '../services/ideas.js'

export default async function ideaRoutes(app) {
  app.get('/api/todo-ideas', async (req) => req.repos.ideas.all())

  app.post('/api/todo-ideas/:id/convert', async (req, reply) => {
    const out = convertIdeaToTask(req.repos, req.params.id)
    if (!out) return reply.status(404).send({ error: 'idea not found' })
    return out
  })

  app.post('/api/todo-ideas/:id/archive', async (req, reply) => {
    if (!req.repos.ideas.get(req.params.id)) return reply.status(404).send({ error: 'idea not found' })
    return req.repos.ideas.update(req.params.id, { status: 'archived' })
  })

  app.post('/api/todo-ideas/:id/discard', async (req, reply) => {
    if (!req.repos.ideas.get(req.params.id)) return reply.status(404).send({ error: 'idea not found' })
    req.repos.ideas.remove(req.params.id)
    return { ok: true }
  })
}
