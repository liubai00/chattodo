import { filterTasks, moveOutOfTodo } from '../services/tasks.js'
import { visibleFilter } from '../services/privacy.js'
import { notifyTaskDoneFx } from '../services/collab.js'
import { makeId, nowIso } from '../lib/ids.js'

const STATUS_LABEL = { todo: '待办', in_progress: '进行中', done: '已完成', archived: '已归档' }

export default async function taskRoutes(app) {
  // 跨用户通知：按显示名找到成员，往对方的通知中心写一条（自己不通知自己）。
  const notifyUserByName = (name, actor, text, icon = 'ph-user-switch') => {
    if (!name || (actor && name === actor.name)) return
    const target = app.db.prepare(`SELECT id FROM users WHERE name = ?`).get(name)
    if (!target || (actor && target.id === actor.id)) return
    app.db.prepare(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,created_at) VALUES (?,?,?,?,?,?,0,?)`)
      .run(makeId('nt'), target.id, 'assign', icon, 'var(--accent-ink)', text, nowIso())
  }
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
      access: repos.tasks.access(task.id),
      collaborators: repos.collaborators.forTask(task.id),
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
    if (patch.status === 'done' && prev.status !== 'done') notifyTaskDoneFx(app.db, repos, req.user, prev.id)
    if (patch.assignee && patch.assignee !== prev.assignee) {
      repos.activity.log(prev.id, '指派给 ' + patch.assignee)
      notifyUserByName(patch.assignee, req.user, `${(req.user && req.user.name) || '有人'} 把「${prev.title}」指派给你`)
    }
    return updated
  })

  app.post('/api/tasks/:id/done', async (req, reply) => {
    const repos = req.repos
    const prev = repos.tasks.get(req.params.id)
    if (!prev) return reply.status(404).send({ error: 'task not found' })
    const t = repos.tasks.update(req.params.id, { status: 'done' })
    repos.activity.log(req.params.id, '状态改为「已完成」')
    if (prev.status !== 'done') notifyTaskDoneFx(app.db, repos, req.user, req.params.id)
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
    const task = repos.tasks.get(req.params.id)
    if (!task) return reply.status(404).send({ error: 'task not found' })
    if (repos.tasks.access(req.params.id) !== 'owner') return reply.status(403).send({ error: '协作任务只有创建者可以删除，你可以选择「退出协作」' })
    // 通知协作者任务已删除，并清理协作关系
    const collabUserIds = repos.collaborators.acceptedUsersOf(req.params.id)
    for (const uid of collabUserIds) {
      app.db.prepare(`INSERT INTO notifications (id,user_id,type,icon,color,text,read,created_at) VALUES (?,?,?,?,?,?,0,?)`)
        .run(makeId('nt'), uid, 'assign', 'ph-trash', 'var(--danger)', `「${task.title}」已被 ${(req.user && req.user.name) || '创建者'} 删除`, nowIso())
    }
    repos.collaborators.removeForTask(req.params.id)
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
    // @提及 → 通知对应成员（按显示名匹配）
    const task = repos.tasks.get(req.params.id)
    const mentioned = [...new Set([...text.matchAll(/@([^\s@，。,、.!！?？]{1,20})/g)].map((m) => m[1]))]
    for (const name of mentioned) {
      notifyUserByName(name, req.user, `${(req.user && req.user.name) || '有人'} 在「${task.title}」的评论中提到了你`, 'ph-chat-circle')
    }
    return cmt
  })
}
