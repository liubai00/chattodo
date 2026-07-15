import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeProjectRepo, type Queryable } from '@linx/infra-projects-pg'
import { makeProjectsApp, type ProjectsApp } from '@linx/app-projects'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface ProjectsPluginDeps {
  db: Queryable
}

/**
 * Projects BC 已迁移路由（组 'projects'）。仅 POST /api/projects（创建）——项目列表随 /api/state 返回，
 * state 聚合路由未迁移，故 GET 仍走 legacy。
 */
export function makeProjectsPlugin(deps: ProjectsPluginDeps): MigratedPlugin {
  const appFor = (userId: string): ProjectsApp =>
    makeProjectsApp({ projects: makeProjectRepo({ db: deps.db, userId }) })

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }

  return {
    group: 'projects',
    register: async (app) => {
      app.post('/api/projects', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const b = (req.body ?? {}) as { name?: unknown; description?: unknown }
        const clean = String(b.name ?? '').trim()
        if (!clean) return reply.status(400).send({ error: '请输入项目名称' })
        if (clean.length > 24) return reply.status(400).send({ error: '项目名称最长 24 字' })
        const application = appFor(userId)
        if (await application.nameExists(clean)) {
          return reply.status(409).send({ error: '同名项目已存在' })
        }
        return application.createProject({
          name: clean,
          description: String(b.description ?? '').trim(),
          status: 'active',
          privacyScope: 'work',
        })
      })
    },
  }
}
