// Data ownership endpoints: export everything / clear the current account's data.
export default async function dataRoutes(app) {
  // GET /api/export — full JSON dump of the current user's data.
  app.get('/api/export', async (req) => {
    const repos = req.repos
    return {
      exportedAt: new Date().toISOString(),
      user: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : null,
      projects: repos.projects.all(),
      tasks: repos.tasks.all(),
      todoIdeas: repos.ideas.all(),
      nonTodoOutputs: repos.nonTodos.all(),
      captureRecords: repos.captureRecords.all(),
      corrections: repos.corrections.all(),
      chat: repos.chat.all(),
      agentProfile: repos.agent.get(),
      appSettings: repos.settings.get(),
    }
  })

  // POST /api/data/clear — wipe the current user's business data.
  // Keeps: account, sessions, app settings, agent profile, AI config.
  app.post('/api/data/clear', async (req) => {
    const userId = req.user ? req.user.id : null
    if (!userId) return { ok: false }
    const db = app.db
    const tables = ['tasks', 'todo_ideas', 'non_todo_outputs', 'projects', 'capture_records', 'corrections', 'ai_errors', 'chat_messages', 'subtasks', 'comments', 'activity', 'notifications']
    const tx = db.transaction(() => {
      for (const t of tables) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId)
      db.prepare(`DELETE FROM task_collaborators WHERE owner_id = ? OR user_id = ?`).run(userId, userId)
      db.prepare(`INSERT INTO chat_messages (id,user_id,role,text,is_error,created_at) VALUES (?,?,?,?,0,?)`)
        .run('msg_' + Date.now().toString(36), userId, 'agent', '数据已清空。把任何想法丢给我，重新开始。', new Date().toISOString())
    })
    tx()
    return { ok: true }
  })
}
