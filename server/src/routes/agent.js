export default async function agentRoutes(app) {
  const { repos } = app
  app.get('/api/agent', async () => repos.agent.get())
  app.put('/api/agent', async (req) => repos.agent.update(req.body || {}))
}
