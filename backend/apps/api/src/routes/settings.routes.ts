import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeSettingsRepo, makeAgentRepo, type Queryable } from '@linx/infra-settings-pg'
import type { AppSettingsPatch, AgentProfilePatch } from '@linx/domain-settings'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface SettingsPluginDeps {
  db: Queryable
  clock?: () => Date
}

/**
 * Settings BC 已迁移路由（组 'settings'）：应用设置 + 智能体档案（均 patch 合并 + updated_at，UPDATE-only）。
 *   GET/PUT /api/settings
 *   GET/PUT /api/agent
 */
export function makeSettingsPlugin(deps: SettingsPluginDeps): MigratedPlugin {
  const { db } = deps
  const clockOpt = deps.clock ? { clock: deps.clock } : {}
  const settingsFor = (userId: string) => makeSettingsRepo({ db, userId, ...clockOpt })
  const agentFor = (userId: string) => makeAgentRepo({ db, userId, ...clockOpt })

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }

  return {
    group: 'settings',
    register: async (app) => {
      app.get('/api/settings', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return settingsFor(userId).get()
      })
      app.put('/api/settings', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return settingsFor(userId).update((req.body ?? {}) as AppSettingsPatch)
      })

      app.get('/api/agent', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return agentFor(userId).get()
      })
      app.put('/api/agent', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        return agentFor(userId).update((req.body ?? {}) as AgentProfilePatch)
      })
    },
  }
}
