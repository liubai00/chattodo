export default async function settingsRoutes(app) {
  const { repos } = app
  app.get('/api/settings', async () => repos.settings.get())
  app.put('/api/settings', async (req) => repos.settings.update(req.body || {}))
}
