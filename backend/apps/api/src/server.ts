import Fastify, { type FastifyInstance } from 'fastify'
import { isAppError } from '@linx/kernel-errors'
import { observabilityPlugin } from './plugins/observability.plugin.js'
import { healthRoutes } from './routes/health.routes.js'
import { readyRoutes } from './routes/ready.routes.js'
import { metricsRoutes } from './routes/metrics.routes.js'

/**
 * 构建 Fastify 实例（composition root 的一部分）。
 * P1：装配 reqId/metrics 观测插件 + 存活/就绪/指标探针 + 类型化错误处理。
 * 后续：接入 platform-auth preHandler、rate-limit、swagger，以及 Facade RouteRegistry
 * （新旧路由逐条切换，未迁路由 fall-through 到 packages/legacy）。
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  app.setErrorHandler((error, req, reply) => {
    if (isAppError(error)) {
      return reply.status(error.httpStatus).send(error.toEnvelope())
    }
    req.log.error(error)
    return reply.status(500).send({ error: 'Internal Server Error', code: 'INTERNAL' })
  })

  await app.register(observabilityPlugin)
  await app.register(healthRoutes)
  await app.register(readyRoutes)
  await app.register(metricsRoutes)
  return app
}
