import { triageInput } from '../services/triage/index.js'

// SSRF 防护：AI Base URL 只能指向公网 http(s) 服务——服务端会带着 Key 主动请求它，
// 放行内网地址等于把容器变成任何成员的内网探针。
function baseUrlError(url) {
  if (!url) return null // 留空 = 用服务商默认地址
  let u
  try { u = new URL(String(url)) } catch { return 'Base URL 格式不正确' }
  if (!/^https?:$/.test(u.protocol)) return 'Base URL 仅支持 http(s)'
  const h = u.hostname.toLowerCase()
  if (
    h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '[::1]' ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) ||
    h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')
  ) return 'Base URL 不允许指向本机或内网地址'
  return null
}

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
    const [own, team] = await Promise.all([req.repos.aiConfig.getOwn(), req.repos.aiConfig.getTeam()])
    const eff = own || team
    return { ...mask(eff), source: own ? 'own' : 'team', team: mask(team) }
  })

  // 团队配置（default 行）——只有管理员能改。
  app.put('/api/ai/config', async (req, reply) => {
    if (req.user && req.user.role !== 'admin') {
      return reply.status(403).send({ error: '仅管理员可修改团队 AI 配置' })
    }
    const bad = baseUrlError(req.body && req.body.baseUrl)
    if (bad) return reply.status(400).send({ error: bad })
    return mask(await req.repos.aiConfig.update(req.body || {}))
  })

  // 个人覆盖配置：任何成员用自己的 Key（只影响自己）。
  app.put('/api/ai/config/own', async (req, reply) => {
    const bad = baseUrlError(req.body && req.body.baseUrl)
    if (bad) return reply.status(400).send({ error: bad })
    return mask(await req.repos.aiConfig.updateOwn(req.body || {}))
  })
  app.delete('/api/ai/config/own', async (req) => { await req.repos.aiConfig.clearOwn(); return { ok: true } })

  // Test the current (or a posted draft) config against a sample input.
  app.post('/api/ai/test', async (req, reply) => {
    const body = req.body || {}
    const bad = baseUrlError(body.baseUrl)
    if (bad) return reply.status(400).send({ error: bad })
    const cfg = { ...(await req.repos.aiConfig.get()), ...body } // allow testing before saving
    const sample = body.sample || '下周三前提交 MVP 文档评审'
    try {
      const result = await triageInput(sample, { aiConfig: cfg })
      return { ok: true, provider: cfg.provider, sample, kind: result.kind, title: result.title }
    } catch (err) {
      return { ok: false, provider: cfg.provider, error: err.message }
    }
  })
}
