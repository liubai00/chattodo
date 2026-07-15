import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeCorrectionRepo,
  makeActivityRepo,
  makeSubtaskRepo,
  type Queryable,
} from '@linx/infra-tasks-pg'
import { makeTasksApp, type TasksApp } from '@linx/app-tasks'
import type { PrivacySettings, TaskListFilter, TaskView, NewTaskInput } from '@linx/domain-tasks'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface TasksPluginDeps {
  db: Queryable
  /** 隐私设置读取（settings BC 未迁移前由 composition root 提供，如查 app_settings）。 */
  getPrivacySettings: (userId: string) => Promise<PrivacySettings>
}

/** 宽松解析 list query：只取字符串值，重复参数(数组)/非法值忽略（承接现网 req.query.* 读法，不抛异常）。 */
function parseListFilter(query: unknown): TaskListFilter {
  const q = (query ?? {}) as Record<string, unknown>
  const pick = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const filter: TaskListFilter = {}
  const view = pick(q.view)
  if (view !== undefined) filter.view = view as TaskView
  const scope = pick(q.scope)
  if (scope !== undefined) filter.scope = scope
  const search = pick(q.search)
  if (search !== undefined) filter.search = search
  return filter
}

/**
 * Tasks BC 已迁移路由（RouteRegistry 组 'tasks'）。
 *
 * 已迁移（无跨用户副作用，可安全权威）：
 *   - 读：GET tasks / tasks/:id / todo-ideas / non-todo-outputs
 *   - 写（仅 Tasks 内部 activity，无跨用户通知）：POST tasks(建)、:id/move-out、:id/reopen、
 *     todo-ideas/:id/{convert,archive,discard}、non-todo-outputs/:id/{convert-to-todo,discard}、
 *     :id/subtasks、PATCH/DELETE subtasks/:id
 * 仍 fall-through 到 legacy（携带【跨用户通知】notifyTaskDoneFx/notifyUserByName 或需 collab BC）：
 *   - PATCH tasks/:id（状态/指派通知）、POST :id/done（完成通知）、DELETE tasks/:id（协作清理+通知）、
 *     GET tasks/:id/detail（协作人 join）、POST :id/comments（@提及通知）
 *   待 P5/P6（collab/notification）就绪后经端口/事件接入再纳入。
 */
export function makeTasksPlugin(deps: TasksPluginDeps): MigratedPlugin {
  function appFor(userId: string): TasksApp {
    const repoDeps = { db: deps.db, userId }
    return makeTasksApp({
      tasks: makeTaskRepo(repoDeps),
      ideas: makeIdeaRepo(repoDeps),
      nonTodos: makeNonTodoRepo(repoDeps),
      captureRecords: makeCaptureRecordRepo(repoDeps),
      corrections: makeCorrectionRepo(repoDeps),
      activity: makeActivityRepo(repoDeps),
      subtasks: makeSubtaskRepo(repoDeps),
      getPrivacySettings: () => deps.getPrivacySettings(userId),
    })
  }

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }
  const idParam = (req: FastifyRequest): string => (req.params as { id: string }).id

  return {
    group: 'tasks',
    register: async (app) => {
      // ── reads ──
      app.get('/api/tasks', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return appFor(userId).listTasks(parseListFilter(req.query))
      })

      app.get('/api/tasks/:id', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const result = await appFor(userId).getTask(idParam(req))
        if (!result) return reply.status(404).send({ error: 'task not found' })
        return result
      })

      app.get('/api/todo-ideas', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return appFor(userId).listIdeas()
      })

      app.get('/api/non-todo-outputs', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return appFor(userId).listNonTodos()
      })

      // ── writes (activity-only, no cross-user notify) ──
      app.post('/api/tasks', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const b = (req.body ?? {}) as Record<string, unknown>
        // 承接现网：仅校验 title 非空白，其余字段原样透传（不做更严的枚举/范围校验）
        if (!b.title || !String(b.title).trim()) {
          return reply.status(400).send({ error: 'title is required' })
        }
        return appFor(userId).createTask(b as unknown as NewTaskInput)
      })

      app.post('/api/tasks/:id/move-out', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const non = await appFor(userId).moveOutTask(idParam(req))
        if (!non) return reply.status(404).send({ error: 'task not found' })
        return { nonTodo: non }
      })

      app.post('/api/tasks/:id/reopen', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const t = await appFor(userId).reopenTask(idParam(req))
        if (!t) return reply.status(404).send({ error: 'task not found' })
        return t
      })

      app.post('/api/todo-ideas/:id/convert', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const res = await appFor(userId).convertIdea(idParam(req))
        if (!res) return reply.status(404).send({ error: 'idea not found' })
        return res
      })

      app.post('/api/todo-ideas/:id/archive', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const idea = await appFor(userId).archiveIdea(idParam(req))
        if (!idea) return reply.status(404).send({ error: 'idea not found' })
        return idea
      })

      app.post('/api/todo-ideas/:id/discard', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const ok = await appFor(userId).discardIdea(idParam(req))
        if (!ok) return reply.status(404).send({ error: 'idea not found' })
        return { ok: true }
      })

      app.post('/api/non-todo-outputs/:id/convert-to-todo', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const res = await appFor(userId).convertNonToTask(idParam(req))
        if (!res) return reply.status(404).send({ error: 'non-todo not found' })
        return res
      })

      app.post('/api/non-todo-outputs/:id/discard', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const ok = await appFor(userId).discardNon(idParam(req))
        if (!ok) return reply.status(404).send({ error: 'non-todo not found' })
        return { ok: true }
      })

      // ── subtasks (Tasks-internal) ──
      app.post('/api/tasks/:id/subtasks', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const id = idParam(req)
        const application = appFor(userId)
        // 承接现网顺序：先校验任务存在(404)，再校验 text(400)；text 用 `|| ''`（与现网一致）
        if (!(await application.getTask(id))) return reply.status(404).send({ error: 'task not found' })
        const text = String((req.body as { text?: unknown } | undefined)?.text || '').trim()
        if (!text) return reply.status(400).send({ error: 'text is required' })
        const sub = await application.addSubtask(id, text)
        if (!sub) return reply.status(404).send({ error: 'task not found' })
        return sub
      })

      app.patch('/api/subtasks/:id', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const sub = await appFor(userId).toggleSubtask(idParam(req))
        if (!sub) return reply.status(404).send({ error: 'subtask not found' })
        return sub
      })

      app.delete('/api/subtasks/:id', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        await appFor(userId).removeSubtask(idParam(req))
        return { ok: true }
      })
    },
  }
}
