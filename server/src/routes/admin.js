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
    const users = db.prepare(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at`).all()
    const cnt = (sql) => {
      const rows = db.prepare(sql).all()
      const m = new Map()
      for (const r of rows) m.set(r.user_id, r.c)
      return m
    }
    const tasks = cnt(`SELECT user_id, COUNT(*) c FROM tasks GROUP BY user_id`)
    const ideas = cnt(`SELECT user_id, COUNT(*) c FROM todo_ideas WHERE status = 'clarifying' GROUP BY user_id`)
    const nons = cnt(`SELECT user_id, COUNT(*) c FROM non_todo_outputs GROUP BY user_id`)
    const errs = cnt(`SELECT user_id, COUNT(*) c FROM ai_errors GROUP BY user_id`)
    return {
      users: users.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at,
        taskCount: tasks.get(u.id) || 0, ideaCount: ideas.get(u.id) || 0,
        nonCount: nons.get(u.id) || 0, errorCount: errs.get(u.id) || 0,
      })),
      totalErrors: db.prepare(`SELECT COUNT(*) c FROM ai_errors`).get().c,
    }
  })

  // GET /api/admin/users/:id — one user's capture records + AI errors (read-only).
  app.get('/api/admin/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const db = app.db
    const uid = req.params.id
    const user = db.prepare(`SELECT id, name, email, role, created_at FROM users WHERE id = ?`).get(uid)
    if (!user) return reply.status(404).send({ error: 'user not found' })
    const records = db.prepare(`SELECT * FROM capture_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all(uid)
      .map((r) => ({ id: r.id, rawInput: r.raw_input, aiKind: r.ai_kind, aiReason: r.ai_reason, resultEntityType: r.result_entity_type, resultEntityId: r.result_entity_id, status: r.status, createdAt: r.created_at }))
    // Resolve result titles for display (raw → judgement → generated title).
    const titleOf = (type, id) => {
      if (!type || !id) return ''
      const table = type === 'task' ? 'tasks' : type === 'todo_idea' ? 'todo_ideas' : 'non_todo_outputs'
      const row = db.prepare(`SELECT title FROM ${table} WHERE id = ?`).get(id)
      return row ? row.title : '（已删除）'
    }
    const errors = db.prepare(`SELECT * FROM ai_errors WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all(uid)
      .map((e) => ({ id: e.id, rawInput: e.raw_input, message: e.message, createdAt: e.created_at }))
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.created_at },
      records: records.map((r) => ({ ...r, resultTitle: titleOf(r.resultEntityType, r.resultEntityId) })),
      errors,
    }
  })
}
