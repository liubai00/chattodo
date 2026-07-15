import Fastify, { type FastifyInstance } from 'fastify'
import { isAppError } from '@linx/kernel-errors'
import { healthRoutes } from './routes/health.routes.js'

/**
 * 构建 Fastify 实例（composition root 的一部分）。
 * P0 仅装配错误处理 + 健康检查；P1 起接入 platform-* 插件（reqId/auth/ratelimit/swagger）
 * 与 Facade RouteRegistry（新旧路由逐条切换）。
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

  await app.register(healthRoutes)
  return app
}
