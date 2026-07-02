import { triageInput } from '../services/triage/index.js'

// Never echo the API key back to the client.
const mask = (cfg) => ({
  provider: cfg.provider,
  baseUrl: cfg.baseUrl,
  model: cfg.model,
  hasKey: !!cfg.apiKey,
  fallbackToRule: cfg.fallbackToRule,
  updatedAt: cfg.updatedAt,
})

export default async function aiRoutes(app) {
  // 生效配置（个人覆盖 > 团队）+ 来源标记；团队配置摘要给成员展示。
  app.get('/api/ai/config', async (req) => {
    const own = req.repos.aiConfig.getOwn()
    const eff = own || req.repos.aiConfig.getTeam()
    return { ...mask(eff), source: own ? 'own' : 'team', team: mask(req.repos.aiConfig.getTeam()) }
  })

  // 团队配置（default 行）——只有管理员能改。
  app.put('/api/ai/config', async (req, reply) => {
    if (req.user && req.user.role !== 'admin') {
      return reply.status(403).send({ error: '仅管理员可修改团队 AI 配置' })
    }
    return mask(req.repos.aiConfig.update(req.body || {}))
  })

  // 个人覆盖配置：任何成员用自己的 Key（只影响自己）。
  app.put('/api/ai/config/own', async (req) => mask(req.repos.aiConfig.updateOwn(req.body || {})))
  app.delete('/api/ai/config/own', async (req) => { req.repos.aiConfig.clearOwn(); return { ok: true } })

  // Test the current (or a posted draft) config against a sample input.
  app.post('/api/ai/test', async (req) => {
    const body = req.body || {}
    const cfg = { ...req.repos.aiConfig.get(), ...body } // allow testing before saving
    const sample = body.sample || '下周三前提交 MVP 文档评审'
    try {
      const result = await triageInput(sample, { aiConfig: cfg })
      return { ok: true, provider: cfg.provider, sample, kind: result.kind, title: result.title }
    } catch (err) {
      return { ok: false, provider: cfg.provider, error: err.message }
    }
  })
}
