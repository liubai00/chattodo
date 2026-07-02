// Project management: list comes with /api/state; here we add creation
// so自动项目归属 has real projects to match against.
export default async function projectRoutes(app) {
  app.post('/api/projects', async (req, reply) => {
    const { name, description } = req.body || {}
    const clean = String(name || '').trim()
    if (!clean) return reply.status(400).send({ error: '请输入项目名称' })
    if (clean.length > 24) return reply.status(400).send({ error: '项目名称最长 24 字' })
    const exists = req.repos.projects.all().some((p) => p.name === clean)
    if (exists) return reply.status(409).send({ error: '同名项目已存在' })
    return req.repos.projects.create({ name: clean, description: String(description || '').trim(), status: 'active', privacyScope: 'work' })
  })
}
