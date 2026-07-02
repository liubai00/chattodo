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
  app.get('/api/ai/config', async (req) => mask(req.repos.aiConfig.get()))

  // AI 接入是全团队共享的（含 API Key）——只有管理员能改。
  app.put('/api/ai/config', async (req, reply) => {
    if (req.user && req.user.role !== 'admin') {
      return reply.status(403).send({ error: '仅管理员可修改 AI 接入配置' })
    }
    return mask(req.repos.aiConfig.update(req.body || {}))
  })

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
