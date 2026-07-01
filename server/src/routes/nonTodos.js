import { convertNonToTask } from '../services/ideas.js'

export default async function nonTodoRoutes(app) {
  const { repos } = app

  app.get('/api/non-todo-outputs', async () => repos.nonTodos.all())

  app.post('/api/non-todo-outputs/:id/convert-to-todo', async (req, reply) => {
    const out = convertNonToTask(repos, req.params.id)
    if (!out) return reply.status(404).send({ error: 'non-todo not found' })
    return out
  })

  app.post('/api/non-todo-outputs/:id/discard', async (req, reply) => {
    if (!repos.nonTodos.get(req.params.id)) return reply.status(404).send({ error: 'non-todo not found' })
    repos.nonTodos.remove(req.params.id)
    return { ok: true }
  })
}
