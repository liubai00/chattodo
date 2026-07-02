// Team directory (any logged-in member): used by the assignee picker and @mentions.
export default async function teamRoutes(app) {
  app.get('/api/team', async () => {
    const users = app.db.prepare(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at`).all()
    return { users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at })) }
  })
}
