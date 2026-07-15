import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify'
import { isAppError } from '@linx/kernel-errors'
import { observabilityPlugin } from '../plugins/observability.plugin.js'
import { authPlugin, type AuthPluginOptions } from '../plugins/auth.plugin.js'
import { healthRoutes } from '../routes/health.routes.js'
import { readyRoutes } from '../routes/ready.routes.js'
import { metricsRoutes } from '../routes/metrics.routes.js'
import { RouteRegistry } from './route-registry.js'
import { registerLegacyFallthrough } from './legacy-fallthrough.js'

/** 已迁移的 interface 插件（按 BC/路由组，受 RouteRegistry 控制是否挂载）。 */
export interface MigratedPlugin {
  group: string
  register: FastifyPluginAsync
}

export interface BuildApiDeps {
  registry?: RouteRegistry
  migratedPlugins?: MigratedPlugin[]
  /** 未迁移路由 fall-through 目标（同进程 legacy 子应用）。 */
  legacyApp?: FastifyInstance
  /** 鉴权配置；省略则不装 auth（开放，本地/探针）。 */
  auth?: AuthPluginOptions
}

/**
 * Facade 组合宿主（Strangler 承重墙）：观测 → 鉴权 → 探针 → 已迁移插件（权威，按 registry）→ legacy fall-through。
 * 对宿主 nginx 与前端透明；切换 = 改 registry 一行；未迁路由字节级仍由 legacy 产出。
 */
export async function buildApi(deps: BuildApiDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true })

  app.setErrorHandler((error, req, reply) => {
    if (isAppError(error)) return reply.status(error.httpStatus).send(error.toEnvelope())
    req.log.error(error)
    return reply.status(500).send({ error: 'Internal Server Error', code: 'INTERNAL' })
  })

  // 容忍空 JSON body（承接现网：/done /move-out 等常带 json content-type 但无体）。
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = typeof body === 'string' ? body : String(body)
    if (!raw || raw.trim() === '') return done(null, {})
    try {
      done(null, JSON.parse(raw))
    } catch (err) {
      ;(err as { statusCode?: number }).statusCode = 400
      done(err as Error)
    }
  })
  // 其它一切 content-type 原样收为 Buffer → 未迁移的非 JSON legacy 路由也能透明 fall-through
  // （否则会在 Facade 层就被 415 挡下，破坏 Strangler 透明性）。
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  await app.register(observabilityPlugin)
  if (deps.auth) await app.register(authPlugin, deps.auth)

  // 探针（非 /api，preHandler 不守）。
  await app.register(healthRoutes)
  await app.register(readyRoutes)
  await app.register(metricsRoutes)

  // 已迁移 interface 插件：仅当其组被 RouteRegistry 标 'new' 才注册（权威）。
  const registry = deps.registry ?? new RouteRegistry()
  for (const plugin of deps.migratedPlugins ?? []) {
    if (registry.isNew(plugin.group)) await app.register(plugin.register)
  }

  // 未匹配路由 → legacy（同进程）。
  if (deps.legacyApp) registerLegacyFallthrough(app, deps.legacyApp)

  return app
}
