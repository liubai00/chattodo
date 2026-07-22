import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeIdeaRepo, type Queryable } from '@linx/infra-tasks-pg'
import { makeProjectRepo } from '@linx/infra-projects-pg'
import { makeSettingsRepo } from '@linx/infra-settings-pg'
import { makeSearchApp, type SearchAppDeps } from '@linx/app-search'
import type { MigratedPlugin } from '../facade/build-api.js'
import { actorFromUser, createTaskRepoFactory, type TaskRepoFactory } from '../composition/task-repo-factory.js'

export interface SearchPluginDeps {
  db: Queryable
  taskRepos?: TaskRepoFactory
}

/**
 * Search BC 已迁移路由（组 'search'）：命令面板 + @引用（均隐私过滤后跨 tasks/ideas/projects 检索）。
 *   GET /api/search?q=
 *   GET /api/mentions?q=
 */
export function makeSearchPlugin(deps: SearchPluginDeps): MigratedPlugin {
  const { db } = deps
  const taskRepos = deps.taskRepos ?? createTaskRepoFactory({ db })
  const appFor = (req: FastifyRequest, userId: string): ReturnType<typeof makeSearchApp> => {
    const searchDeps: SearchAppDeps = {
      settings: makeSettingsRepo({ db, userId }),
      tasks: taskRepos.forRequest({ actor: actorFromUser(req.user!) }),
      ideas: makeIdeaRepo({ db, userId }),
      projects: taskRepos.backend === 'baserow' ? { all: async () => [] } : makeProjectRepo({ db, userId }),
    }
    return makeSearchApp(searchDeps)
  }

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }
  const q = (req: FastifyRequest): string | undefined => (req.query as { q?: string } | undefined)?.q

  return {
    group: 'search',
    register: async (app) => {
      app.get('/api/search', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return appFor(req, userId).search(q(req))
      })
      app.get('/api/mentions', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return appFor(req, userId).mentions(q(req))
      })
    },
  }
}
