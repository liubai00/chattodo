import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeActivityRepo,
  type Queryable,
} from '@linx/infra-tasks-pg'
import { makeProjectRepo } from '@linx/infra-projects-pg'
import { makeProjectsApp } from '@linx/app-projects'
import { makeCaptureApp, type CaptureApp } from '@linx/app-capture'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface CapturePluginDeps {
  db: Queryable
}

/**
 * Capture BC 已迁移路由（组 'capture'）：POST /api/capture — 规则 triage → 建实体 + 生成记录 + activity。
 *
 * ⚠ 仅规则版 triage。LLM triage（用户配置了 provider+apiKey 时）暂留 legacy（P7 才迁）。
 * 故生产切权威应由 composition root 按 AI_PROVIDER 分流：rule 模式可切 'new'，配置了 LLM 的仍 'legacy'
 * （设计所述「两路 triage 并存靠 registry 分流」）。
 */
export function makeCapturePlugin(deps: CapturePluginDeps): MigratedPlugin {
  const captureFor = (userId: string): CaptureApp => {
    const repoDeps = { db: deps.db, userId }
    const projects = makeProjectsApp({ projects: makeProjectRepo(repoDeps) })
    return makeCaptureApp({
      tasks: makeTaskRepo(repoDeps),
      ideas: makeIdeaRepo(repoDeps),
      nonTodos: makeNonTodoRepo(repoDeps),
      captureRecords: makeCaptureRecordRepo(repoDeps),
      activity: makeActivityRepo(repoDeps),
      projectIdForText: (t) => projects.projectIdForText(t),
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
    group: 'capture',
    register: async (app) => {
      app.post('/api/capture', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const b = (req.body ?? {}) as { text?: unknown; source?: unknown }
        const text = String(b.text ?? '')
        if (!text.trim()) return reply.status(400).send({ error: 'text is required' })
        return captureFor(userId).capture({ text, source: String(b.source ?? 'web') })
      })
    },
  }
}
