// Data ownership endpoints: export everything / clear the current account's data.
export default async function dataRoutes(app) {
  // GET /api/export — full JSON dump of the current user's data.
  app.get('/api/export', async (req) => {
    const repos = req.repos
    const userId = req.user ? req.user.id : null
    const [projects, tasks, todoIdeas, nonTodoOutputs, captureRecords, corrections, chat, agentProfile, appSettings, friendRows] = await Promise.all([
      repos.projects.all(), repos.tasks.all(), repos.ideas.all(), repos.nonTodos.all(),
      repos.captureRecords.all(), repos.corrections.all(), repos.chat.all(), repos.agent.get(), repos.settings.get(),
      userId ? app.db.all(`SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ?`, [userId, userId]) : Promise.resolve([]),
    ])
    const friendships = friendRows.map((f) => ({ id: f.id, requesterId: f.requester_id, addresseeId: f.addressee_id, status: f.status, createdAt: f.created_at, respondedAt: f.responded_at }))
    return {
      exportedAt: new Date().toISOString(),
      user: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : null,
      projects, tasks, todoIdeas, nonTodoOutputs, captureRecords, corrections, chat, agentProfile, appSettings, friendships,
    }
  })

  // POST /api/data/clear — wipe the current user's business data.
  // Keeps: account, sessions, app settings, agent profile, AI config.
  app.post('/api/data/clear', async (req) => {
    const userId = req.user ? req.user.id : null
    if (!userId) return { ok: false }
    const db = app.db
    const tables = ['tasks', 'todo_ideas', 'non_todo_outputs', 'projects', 'capture_records', 'corrections', 'ai_errors', 'chat_messages', 'subtasks', 'comments', 'activity', 'notifications']
    await db.tx(async (t) => {
      for (const table of tables) await t.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId])
      await t.run(`DELETE FROM task_collaborators WHERE owner_id = ? OR user_id = ?`, [userId, userId])
      await t.run(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,0,?)`,
        ['msg_' + Date.now().toString(36), userId, 'agent', '数据已清空。把任何想法丢给我，重新开始。', new Date().toISOString()])
    })
    return { ok: true }
  })
}
