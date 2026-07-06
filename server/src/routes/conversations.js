// 多对话：列表 / 新建 / 改名 / 删除 / 拉某会话的消息。
//   GET    /api/conversations                 — 会话列表（含最后一条预览、消息数）
//   POST   /api/conversations {title?}         — 新建会话
//   GET    /api/conversations/:id/messages     — 该会话的消息（含用户消息→生成实体回链）
//   PATCH  /api/conversations/:id {title}       — 改名
//   DELETE /api/conversations/:id              — 删除（连同其消息）
export default async function conversationRoutes(app) {
  app.get('/api/conversations', async (req) => ({ conversations: await req.repos.conversations.list() }))

  app.post('/api/conversations', async (req) => {
    const title = String((req.body && req.body.title) || '').trim()
    return req.repos.conversations.create(title || '新对话')
  })

  app.get('/api/conversations/:id/messages', async (req, reply) => {
    const repos = req.repos
    const conv = await repos.conversations.get(req.params.id)
    if (!conv) return reply.status(404).send({ error: '会话不存在' })
    const [rows, records] = await Promise.all([repos.chat.all(req.params.id), repos.captureRecords.all()])
    // 历史回链：用户消息 → 它生成的实体（按原文匹配最近一条生成记录）
    const byRaw = new Map()
    for (const r of records) if (r.rawInput && r.resultEntityId && !byRaw.has(r.rawInput)) byRaw.set(r.rawInput, { refType: r.resultEntityType, refId: r.resultEntityId })
    const chat = rows.map((m) => (m.role === 'user' && byRaw.get(m.text)) ? { ...m, ...byRaw.get(m.text) } : m)
    return { conversation: conv, chat }
  })

  app.patch('/api/conversations/:id', async (req, reply) => {
    const title = String((req.body && req.body.title) || '').trim()
    if (!title) return reply.status(400).send({ error: '标题不能为空' })
    const conv = await req.repos.conversations.rename(req.params.id, title)
    if (!conv) return reply.status(404).send({ error: '会话不存在' })
    return conv
  })

  app.delete('/api/conversations/:id', async (req) => {
    await req.repos.conversations.remove(req.params.id)
    return { ok: true }
  })
}
