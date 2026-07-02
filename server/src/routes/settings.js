export default async function settingsRoutes(app) {
  app.get('/api/settings', async (req) => req.repos.settings.get())
  app.put('/api/settings', async (req) => req.repos.settings.update(req.body || {}))
}
