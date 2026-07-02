export default async function notificationRoutes(app) {
  app.get('/api/notifications', async (req) => req.repos.notifications.all())
  app.post('/api/notifications/read-all', async (req) => { req.repos.notifications.markAllRead(); return { ok: true } })
  app.post('/api/notifications/:id/read', async (req) => { req.repos.notifications.markRead(req.params.id); return { ok: true } })
}
