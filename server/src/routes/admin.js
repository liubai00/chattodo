// Read-only internal admin: user overview + per-user capture records / AI errors.
// Admin role only — members get 403.
export default async function adminRoutes(app) {
  const requireAdmin = (req, reply) => {
    if (!req.user || req.user.role !== 'admin') {
      reply.status(403).send({ error: '仅管理员可访问内部后台' })
      return false
    }
    return true
  }

  // GET /api/admin/overview — all users with entity/error counts.
  app.get('/api/admin/overview', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const db = app.db
    const cnt = async (sql) => {
      const rows = await db.all(sql)
      const m = new Map()
      for (const r of rows) m.set(r.user_id, Number(r.c))
      return m
    }
    const [users, tasks, ideas, nons, errs, totalErrors] = await Promise.all([
      db.all(`SELECT id, name, account_name, email, role, created_at FROM users ORDER BY created_at`),
      cnt(`SELECT user_id, COUNT(*) c FROM tasks GROUP BY user_id`),
      cnt(`SELECT user_id, COUNT(*) c FROM todo_ideas WHERE status = 'clarifying' GROUP BY user_id`),
      cnt(`SELECT user_id, COUNT(*) c FROM non_todo_outputs GROUP BY user_id`),
      cnt(`SELECT user_id, COUNT(*) c FROM ai_errors GROUP BY user_id`),
      db.get(`SELECT COUNT(*) c FROM ai_errors`),
    ])
    return {
      users: users.map((u) => ({
        id: u.id, name: u.name, accountName: u.account_name || u.name, email: u.email, role: u.role, createdAt: u.created_at,
        taskCount: tasks.get(u.id) || 0, ideaCount: ideas.get(u.id) || 0,
        nonCount: nons.get(u.id) || 0, errorCount: errs.get(u.id) || 0,
      })),
      totalErrors: Number(totalErrors.c),
    }
  })

  // GET /api/admin/users/:id — one user's capture records + AI errors (read-only).
  app.get('/api/admin/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const db = app.db
    const uid = req.params.id
    const user = await db.get(`SELECT id, name, account_name, email, role, created_at FROM users WHERE id = ?`, [uid])
    if (!user) return reply.status(404).send({ error: 'user not found' })
    const recRows = await db.all(`SELECT * FROM capture_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [uid])
    const records = recRows.map((r) => ({ id: r.id, rawInput: r.raw_input, aiKind: r.ai_kind, aiReason: r.ai_reason, resultEntityType: r.result_entity_type, resultEntityId: r.result_entity_id, status: r.status, createdAt: r.created_at }))
    const titleOf = async (type, id) => {
      if (!type || !id) return ''
      const table = type === 'task' ? 'tasks' : type === 'todo_idea' ? 'todo_ideas' : 'non_todo_outputs'
      const row = await db.get(`SELECT title FROM ${table} WHERE id = ?`, [id])
      return row ? row.title : '（已删除）'
    }
    const errRows = await db.all(`SELECT * FROM ai_errors WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [uid])
    const errors = errRows.map((e) => ({ id: e.id, rawInput: e.raw_input, message: e.message, createdAt: e.created_at }))
    const recordsWithTitle = []
    for (const r of records) recordsWithTitle.push({ ...r, resultTitle: await titleOf(r.resultEntityType, r.resultEntityId) })
    return {
      user: { id: user.id, name: user.name, accountName: user.account_name || user.name, email: user.email, role: user.role, createdAt: user.created_at },
      records: recordsWithTitle,
      errors,
    }
  })
}
