export default async function agentRoutes(app) {
  app.get('/api/agent', async (req) => req.repos.agent.get())
  app.put('/api/agent', async (req) => req.repos.agent.update(req.body || {}))
}
