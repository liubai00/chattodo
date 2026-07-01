import { filterTasks, moveOutOfTodo } from '../services/tasks.js'
import { visibleFilter } from '../services/privacy.js'

export default async function taskRoutes(app) {
  const { repos } = app

  app.get('/api/tasks', async (req) => {
    const { view, scope, search } = req.query || {}
    // Apply the global privacy filter first, then the view/scope/search filters.
    const visible = visibleFilter(repos.tasks.all(), repos.settings.get())
    return filterTasks(visible, { view, scope, search })
  })

  app.post('/api/tasks', async (req, reply) => {
    const b = req.body || {}
    if (!b.title || !String(b.title).trim()) return reply.status(400).send({ error: 'title is required' })
    return repos.tasks.create(b)
  })

  app.get('/api/tasks/:id', async (req, reply) => {
    const task = repos.tasks.get(req.params.id)
    if (!task) return reply.status(404).send({ error: 'task not found' })
    return { task, generationRecord: repos.captureRecords.getByEntity('task', task.id) || null }
  })

  app.patch('/api/tasks/:id', async (req, reply) => {
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    return repos.tasks.update(req.params.id, req.body || {})
  })

  app.post('/api/tasks/:id/done', async (req, reply) => {
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    return repos.tasks.update(req.params.id, { status: 'done' })
  })

  app.post('/api/tasks/:id/reopen', async (req, reply) => {
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    return repos.tasks.update(req.params.id, { status: 'todo' })
  })

  app.post('/api/tasks/:id/move-out', async (req, reply) => {
    const non = moveOutOfTodo(repos, req.params.id)
    if (!non) return reply.status(404).send({ error: 'task not found' })
    return { nonTodo: non }
  })
}
