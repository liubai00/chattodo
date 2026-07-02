import { filterTasks, moveOutOfTodo } from '../services/tasks.js'
import { visibleFilter } from '../services/privacy.js'

const STATUS_LABEL = { todo: '待办', in_progress: '进行中', done: '已完成', archived: '已归档' }

export default async function taskRoutes(app) {
  app.get('/api/tasks', async (req) => {
    const repos = req.repos
    const { view, scope, search } = req.query || {}
    const visible = visibleFilter(repos.tasks.all(), repos.settings.get())
    return filterTasks(visible, { view, scope, search })
  })

  app.post('/api/tasks', async (req, reply) => {
    const repos = req.repos
    const b = req.body || {}
    if (!b.title || !String(b.title).trim()) return reply.status(400).send({ error: 'title is required' })
    const task = repos.tasks.create(b)
    repos.activity.log(task.id, '任务已创建')
    return task
  })

  app.get('/api/tasks/:id', async (req, reply) => {
    const repos = req.repos
    const task = repos.tasks.get(req.params.id)
    if (!task) return reply.status(404).send({ error: 'task not found' })
    return { task, generationRecord: repos.captureRecords.getByEntity('task', task.id) || null }
  })

  // Full detail: task + generation record + subtasks + comments + activity.
  app.get('/api/tasks/:id/detail', async (req, reply) => {
    const repos = req.repos
    const task = repos.tasks.get(req.params.id)
    if (!task) return reply.status(404).send({ error: 'task not found' })
    return {
      task,
      generationRecord: repos.captureRecords.getByEntity('task', task.id) || null,
      subtasks: repos.subtasks.byTask(task.id),
      comments: repos.comments.byTask(task.id),
      activity: repos.activity.byTask(task.id),
    }
  })

  app.patch('/api/tasks/:id', async (req, reply) => {
    const repos = req.repos
    const prev = repos.tasks.get(req.params.id)
    if (!prev) return reply.status(404).send({ error: 'task not found' })
    const patch = req.body || {}
    const updated = repos.tasks.update(req.params.id, patch)
    if (patch.status && patch.status !== prev.status) repos.activity.log(prev.id, '状态改为「' + (STATUS_LABEL[patch.status] || patch.status) + '」')
    if (patch.assignee && patch.assignee !== prev.assignee) repos.activity.log(prev.id, '指派给 ' + patch.assignee)
    return updated
  })

  app.post('/api/tasks/:id/done', async (req, reply) => {
    const repos = req.repos
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    const t = repos.tasks.update(req.params.id, { status: 'done' })
    repos.activity.log(req.params.id, '状态改为「已完成」')
    return t
  })

  app.post('/api/tasks/:id/reopen', async (req, reply) => {
    const repos = req.repos
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    const t = repos.tasks.update(req.params.id, { status: 'todo' })
    repos.activity.log(req.params.id, '状态改为「待办」')
    return t
  })

  app.post('/api/tasks/:id/move-out', async (req, reply) => {
    const non = moveOutOfTodo(req.repos, req.params.id)
    if (!non) return reply.status(404).send({ error: 'task not found' })
    return { nonTodo: non }
  })

  app.delete('/api/tasks/:id', async (req, reply) => {
    const repos = req.repos
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    repos.tasks.remove(req.params.id)
    return { ok: true }
  })

  // ---- Subtasks ----
  app.post('/api/tasks/:id/subtasks', async (req, reply) => {
    const repos = req.repos
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    const text = String((req.body && req.body.text) || '').trim()
    if (!text) return reply.status(400).send({ error: 'text is required' })
    const sub = repos.subtasks.create(req.params.id, text)
    repos.activity.log(req.params.id, '添加子任务：' + text)
    return sub
  })
  app.patch('/api/subtasks/:id', async (req, reply) => {
    const sub = req.repos.subtasks.toggle(req.params.id)
    if (!sub) return reply.status(404).send({ error: 'subtask not found' })
    return sub
  })
  app.delete('/api/subtasks/:id', async (req) => { req.repos.subtasks.remove(req.params.id); return { ok: true } })

  // ---- Comments ----
  app.post('/api/tasks/:id/comments', async (req, reply) => {
    const repos = req.repos
    if (!repos.tasks.get(req.params.id)) return reply.status(404).send({ error: 'task not found' })
    const b = req.body || {}
    const text = String(b.text || '').trim()
    if (!text) return reply.status(400).send({ error: 'text is required' })
    const cmt = repos.comments.create(req.params.id, b.author || (req.user && req.user.name) || '我', text)
    repos.activity.log(req.params.id, '发表了评论')
    return cmt
  })
}
