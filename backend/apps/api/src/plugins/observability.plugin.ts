import fp from 'fastify-plugin'
import type { FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { enterReqId } from '@linx/platform-logger'
import { httpRequestsTotal, httpRequestDurationMs } from '@linx/platform-observability'

interface Timed {
  startMs?: number
}

/**
 * reqId 贯穿 + HTTP 指标。用 fastify-plugin 破除封装 → 钩子对全量路由（含未来 Facade
 * mount 的 legacy）生效。onRequest 绑定 reqId（后续日志自动带），onResponse 记录 metrics。
 */
export const observabilityPlugin = fp(
  async (app) => {
    app.addHook('onRequest', async (req: FastifyRequest, reply) => {
      const header = req.headers['x-request-id']
      const reqId = (Array.isArray(header) ? header[0] : header) ?? randomUUID()
      enterReqId(reqId)
      void reply.header('x-request-id', reqId)
      ;(req as FastifyRequest & Timed).startMs = performance.now()
    })

    app.addHook('onResponse', async (req: FastifyRequest, reply) => {
      const start = (req as FastifyRequest & Timed).startMs
      const route = req.routeOptions?.url ?? 'unmatched'
      const labels = { method: req.method, route, status: String(reply.statusCode) }
      httpRequestsTotal.inc(labels)
      if (start !== undefined) {
        httpRequestDurationMs.observe(labels, performance.now() - start)
      }
    })
  },
  { name: 'observability' },
)
