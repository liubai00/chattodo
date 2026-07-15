import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeCorrectionRepo,
  type Queryable,
} from '@linx/infra-tasks-pg'
import { makeTasksApp, type TasksApp } from '@linx/app-tasks'
import type { PrivacySettings, TaskListFilter, TaskView } from '@linx/domain-tasks'
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
 * ⚠ 仅迁移【纯读】路由（GET 列表 / 详情）——它们无副作用，可安全成为权威。
 * 写路由（create/patch/done/reopen/move-out/convert/discard）携带两类尚未复现的副作用：
 *   ① activity.log（Tasks 内部活动流，待 P2-c 迁 activity/subtasks/comments）；
 *   ② 跨用户通知 notifyTaskDoneFx / notifyUserByName（collab/notification BC，待 P5/P6）。
 * 故写路由【继续 fall-through 到 legacy】以保留全部副作用；app-tasks 的对应 use-case 已就绪并测过，
 * 待副作用端口/事件接入后再纳入本插件（Strangler：不完全等价不切权威）。
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

  return {
    group: 'tasks',
    register: async (app) => {
      app.get('/api/tasks', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return appFor(userId).listTasks(parseListFilter(req.query))
      })

      app.get('/api/tasks/:id', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const { id } = req.params as { id: string }
        const result = await appFor(userId).getTask(id)
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
    },
  }
}
