// Health check route.
export default async function healthRoutes(app) {
  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }))
}
