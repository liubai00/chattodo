import { convertNonToTask } from '../services/ideas.js'

export default async function nonTodoRoutes(app) {
  app.get('/api/non-todo-outputs', async (req) => req.repos.nonTodos.all())

  app.post('/api/non-todo-outputs/:id/convert-to-todo', async (req, reply) => {
    const out = await convertNonToTask(req.repos, req.params.id)
    if (!out) return reply.status(404).send({ error: 'non-todo not found' })
    return out
  })

  app.post('/api/non-todo-outputs/:id/discard', async (req, reply) => {
    if (!(await req.repos.nonTodos.get(req.params.id))) return reply.status(404).send({ error: 'non-todo not found' })
    await req.repos.nonTodos.remove(req.params.id)
    return { ok: true }
  })
}
