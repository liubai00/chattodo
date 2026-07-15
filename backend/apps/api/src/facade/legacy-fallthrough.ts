import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { getReqId } from '@linx/platform-logger'

// 逐跳头（转发时两侧都不透传，由各自宿主重算）。
const HOP_BY_HOP = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'host'])
// 响应回抄时跳过：保留 Facade 自己设置的 reqId（不被 legacy 覆盖）。
const RESP_SKIP = new Set([...HOP_BY_HOP, 'x-request-id'])

/**
 * 未匹配路由 fall-through：主宿主的 notFoundHandler 把请求转发给同进程内的 legacy 子应用（inject），
 * 再把响应原样回抄。已迁移路由被主宿主的新插件匹配，不会走到这里 → legacy 版本天然不被触达。
 *
 * ⚠ 流式局限：inject 会缓冲整个响应、直到 'end' 才 resolve，SSE 流永不 end → 请求悬挂。
 *   故此处对 `Accept: text/event-stream` 直接 501 快速失败（不静默悬挂）。SSE/流式路由（/api/events、
 *   /api/chat/stream）迁移期必须保留在主宿主内以流式插件承接，或由 deploy-time 真实 in-process mount 直连。
 */
export function registerLegacyFallthrough(app: FastifyInstance, legacyApp: FastifyInstance): void {
  app.setNotFoundHandler(async (req, reply) => {
    const accept = req.headers.accept
    if (typeof accept === 'string' && accept.includes('text/event-stream')) {
      return reply
        .status(501)
        .send({ error: 'streaming not supported via legacy fall-through', code: 'NOT_IMPLEMENTED' })
    }

    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || HOP_BY_HOP.has(k.toLowerCase())) continue
      headers[k] = Array.isArray(v) ? v.join(', ') : String(v)
    }
    // 把 Facade 的 reqId 透传给 legacy，保证跨宿主日志可关联。
    const rid = getReqId()
    if (rid) headers['x-request-id'] = rid

    const opts: InjectOptions = {
      method: req.method as NonNullable<InjectOptions['method']>,
      url: req.url,
      headers,
    }
    if (req.body !== undefined && req.body !== null) {
      opts.payload = req.body as NonNullable<InjectOptions['payload']>
    }

    const res: LightMyRequestResponse = await legacyApp.inject(opts)

    void reply.status(res.statusCode)
    for (const [k, v] of Object.entries(res.headers)) {
      if (v === undefined || RESP_SKIP.has(k.toLowerCase())) continue
      void reply.header(k, v as string | string[] | number)
    }
    return reply.send(res.rawPayload)
  })
}
