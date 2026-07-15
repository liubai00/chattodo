// @linx/legacy — 现网单体（server/src/*）在新宿主中的封装点（Strangler G2/G3）。
//
// ⚠ 施工状态：本文件目前是可运行的 **SHELL**。P1-e 的完整实现（deploy-time）= 把 server/src/*
//   整体原样移入本包 src/、导出其 buildApp()，并把 DB/Redis 句柄改为由 apps/api 注入（共用同一
//   pg.Pool / Redis / 同一 sessions 表）。见 docs/backend-migration-plan.md §3.1。该步骤会触及在跑的
//   后端栈与其原生依赖（pg/better-sqlite3/redis），且需生产库内省，故留到实际切流时执行。
//
// 当前 shell 提供一个最小可运行的 legacy Fastify 应用，用于本地验证 apps/api 的 Facade
// fall-through 机制（逐路由权威切换 / 未匹配转发 / auth·reqId·metrics 贯穿）。
import Fastify, { type FastifyInstance } from 'fastify'

/** deploy-time 由 composition root 注入的共享基础设施（占位）。 */
export interface LegacyDeps {
  /** 共享 pg.Pool / DbHandle（移入 server/src 后其 db 句柄由此注入）。 */
  db?: unknown
  /** 共享 Redis / eventbus。 */
  redis?: unknown
  /** 运行配置。 */
  config?: Record<string, unknown>
}

/**
 * 构建 legacy 子应用（当前为 shell）。返回一个 Fastify 实例，供 apps/api 以 fall-through 方式挂载。
 * 真实实现将改为委托 server/src 的 buildApp(injectedDeps)。
 */
export async function buildLegacyApp(_deps: LegacyDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true })

  // 占位路由：证明 fall-through 能把未迁移路由交给 legacy 处理。
  app.get('/api/legacy/ping', async () => ({ ok: true, from: 'legacy-shell' }))

  app.setNotFoundHandler(async (_req, reply) =>
    reply.status(404).send({ error: 'not found (legacy shell)', code: 'NOT_FOUND' }),
  )

  await app.ready()
  return app
}
