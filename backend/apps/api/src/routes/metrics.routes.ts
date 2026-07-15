import type { FastifyInstance } from 'fastify'
import { renderMetrics, metricsContentType } from '@linx/platform-observability'

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    void reply.header('content-type', metricsContentType)
    return renderMetrics()
  })
}
