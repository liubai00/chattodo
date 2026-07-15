import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeAiConfigRepo, type Queryable } from '@linx/infra-ai-config-pg'
import type { AiConfig, AiConfigPatch } from '@linx/domain-ai-config'
import { makeLlmClient, type LlmClient } from '@linx/platform-llm'
import { makeTriageService } from '@linx/agent-triage-llm'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface AiConfigPluginDeps {
  db: Queryable
  /** LLM 客户端（/api/ai/test 用）；省略则真实 fetch。 */
  llm?: LlmClient
  clock?: () => Date
}

/** SSRF 防护：AI Base URL 只能指向公网 http(s)，禁止本机/内网（服务端会带 Key 主动请求它）。 */
export function baseUrlError(url: unknown): string | null {
  if (!url) return null // 留空 = 用服务商默认地址
  let u: URL
  try {
    u = new URL(String(url))
  } catch {
    return 'Base URL 格式不正确'
  }
  if (!/^https?:$/.test(u.protocol)) return 'Base URL 仅支持 http(s)'
  const h = u.hostname.toLowerCase()
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    !h.includes('.')
  )
    return 'Base URL 不允许指向本机或内网地址'
  return null
}

/** 永不回显 apiKey，只暴露 hasKey。 */
function mask(cfg: AiConfig): Record<string, unknown> {
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasKey: !!cfg.apiKey,
    fallbackToRule: cfg.fallbackToRule,
    updatedAt: cfg.updatedAt,
  }
}

/**
 * AI Config BC 已迁移路由（组 'ai'）：模型接入配置（个人覆盖团队）+ 试跑。
 *   GET    /api/ai/config       — 生效配置（own||team）+ source + team 摘要
 *   PUT    /api/ai/config       — 改团队配置（仅管理员）
 *   PUT    /api/ai/config/own   — 改个人覆盖
 *   DELETE /api/ai/config/own   — 清除个人覆盖
 *   POST   /api/ai/test         — 用当前/草稿配置对样例试跑 triage
 */
export function makeAiConfigPlugin(deps: AiConfigPluginDeps): MigratedPlugin {
  const { db } = deps
  const clockOpt = deps.clock ? { clock: deps.clock } : {}
  const repoFor = (userId: string) => makeAiConfigRepo({ db, userId, ...clockOpt })
  const triage = makeTriageService({ llm: deps.llm ?? makeLlmClient() })

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }

  return {
    group: 'ai',
    register: async (app) => {
      app.get('/api/ai/config', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const repo = repoFor(userId)
        const [own, team] = await Promise.all([repo.getOwn(), repo.getTeam()])
        const eff = own ?? team
        return { ...mask(eff), source: own ? 'own' : 'team', team: mask(team) }
      })

      app.put('/api/ai/config', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        if (req.user && req.user.role !== 'admin') {
          return reply.status(403).send({ error: '仅管理员可修改团队 AI 配置' })
        }
        const body = (req.body ?? {}) as AiConfigPatch
        const bad = baseUrlError(body.baseUrl)
        if (bad) return reply.status(400).send({ error: bad })
        return mask(await repoFor(userId).update(body))
      })

      app.put('/api/ai/config/own', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const body = (req.body ?? {}) as AiConfigPatch
        const bad = baseUrlError(body.baseUrl)
        if (bad) return reply.status(400).send({ error: bad })
        const updated = await repoFor(userId).updateOwn(body)
        return updated ? mask(updated) : mask(await repoFor(userId).getTeam())
      })

      app.delete('/api/ai/config/own', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        await repoFor(userId).clearOwn()
        return { ok: true }
      })

      app.post('/api/ai/test', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const body = (req.body ?? {}) as AiConfigPatch & { sample?: string }
        const bad = baseUrlError(body.baseUrl)
        if (bad) return reply.status(400).send({ error: bad })
        const cfg = { ...(await repoFor(userId).get()), ...body } // 允许试跑未保存的草稿
        const sample = body.sample || '下周三前提交 MVP 文档评审'
        try {
          const result = await triage.triageInput(sample, cfg)
          return { ok: true, provider: cfg.provider, sample, kind: result.kind, title: result.title }
        } catch (err) {
          return { ok: false, provider: cfg.provider, error: (err as Error).message }
        }
      })
    },
  }
}
