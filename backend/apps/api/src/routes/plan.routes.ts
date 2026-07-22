import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeActivityRepo, type Queryable } from '@linx/infra-tasks-pg'
import { makeSettingsRepo } from '@linx/infra-settings-pg'
import { makePlanApp, type PlanAppDeps, type PlanCommitItem } from '@linx/app-plan'
import type { MigratedPlugin } from '../facade/build-api.js'
import { actorFromUser, createTaskRepoFactory, type TaskRepoFactory } from '../composition/task-repo-factory.js'

export interface PlanPluginDeps {
  db: Queryable
  taskRepos?: TaskRepoFactory
  clock?: () => Date
  /** epoch 毫秒源（commit 排布起点；注入以便测试）。 */
  now?: () => number
}

/**
 * Plan BC 已迁移路由（组 'plan'）：规划 + 落地。
 *   POST /api/plan          {blockMinutes?}  — 从可见可执行任务规划两小时
 *   POST /api/plan/commit   {items}          — 按序写 plannedAt + 活动「加入执行计划」
 */
export function makePlanPlugin(deps: PlanPluginDeps): MigratedPlugin {
  const { db } = deps
  const taskRepos = deps.taskRepos ?? createTaskRepoFactory({ db })
  const clockOpt = deps.clock ? { clock: deps.clock } : {}
  const appFor = (req: FastifyRequest, userId: string): ReturnType<typeof makePlanApp> => {
    const planDeps: PlanAppDeps = {
      settings: makeSettingsRepo({ db, userId, ...clockOpt }),
      tasks: taskRepos.forRequest({ actor: actorFromUser(req.user!), ...clockOpt }),
      activity: makeActivityRepo({ db, userId, ...clockOpt }),
      ...(deps.now ? { now: deps.now } : {}),
    }
    return makePlanApp(planDeps)
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
    group: 'plan',
    register: async (app) => {
      app.post('/api/plan', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const blockMinutes = Number((req.body as { blockMinutes?: unknown } | undefined)?.blockMinutes) || 120
        return appFor(req, userId).plan(blockMinutes)
      })

      app.post('/api/plan/commit', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        if (taskRepos.backend === 'baserow') {
          return reply.status(409).send({ error: '首版 Baserow 默认列不包含执行计划时间，暂不支持提交计划' })
        }
        const items = (req.body as { items?: unknown } | undefined)?.items
        return appFor(req, userId).commit(Array.isArray(items) ? (items as PlanCommitItem[]) : [])
      })
    },
  }
}
