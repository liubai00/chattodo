import type { FastifyInstance } from 'fastify'
import { readiness } from '@linx/platform-observability'

export async function readyRoutes(app: FastifyInstance): Promise<void> {
  // 就绪探针：聚合已注册的依赖检查（P1 起 platform-db/redis 注册；P0/P1 早期为空 → ok）。
  app.get('/ready', async (_req, reply) => {
    const result = await readiness.check()
    void reply.status(result.ok ? 200 : 503)
    return { ready: result.ok, checks: result.checks }
  })
}
