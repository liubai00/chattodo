import { loadConfig } from '@linx/platform-config'
import { baseLogger } from '@linx/platform-logger'
import { createDb } from '@linx/platform-db'
import { createSessionStore } from '@linx/platform-auth'
import { buildLegacyApp } from '@linx/legacy'
import { buildApi } from './facade/build-api.js'
import { RouteRegistry } from './facade/route-registry.js'
import type { AuthPluginOptions } from './plugins/auth.plugin.js'

const config = loadConfig()

async function main(): Promise<void> {
  // 组装 Facade 宿主：legacy 子应用 fall-through + RouteRegistry（默认全 legacy，从环境变量覆盖）。
  const registry = new RouteRegistry({ default: 'legacy' })
  registry.applyEnv(process.env)
  const legacyApp = await buildLegacyApp()

  // 生产（配了 DATABASE_URL）接入统一鉴权：读现网同一 sessions 表；DB 异常 → 视为未登录（fail-closed 到 401）。
  let auth: AuthPluginOptions | undefined
  if (config.databaseUrl) {
    const db = await createDb({ databaseUrl: config.databaseUrl })
    const store = createSessionStore({ db })
    auth = {
      resolveSession: async (token) => {
        try {
          return await store.resolve(token)
        } catch (err) {
          baseLogger.error({ err }, '[linx-api] session resolve failed → treating as unauthenticated')
          return undefined
        }
      },
    }
  } else {
    baseLogger.warn('[linx-api] DATABASE_URL 未配置：以开放模式运行（无鉴权），仅供本地。')
  }

  const app = await buildApi({ legacyApp, registry, ...(auth ? { auth } : {}) })

  await app.listen({ port: config.port, host: config.host })
  baseLogger.info({ port: config.port, host: config.host, auth: Boolean(auth) }, '[linx-api] listening (facade)')

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      baseLogger.info({ sig }, '[linx-api] shutting down')
      void Promise.all([app.close(), legacyApp.close()]).then(() => process.exit(0))
    })
  }
}

main().catch((err: unknown) => {
  baseLogger.error({ err }, '[linx-api] failed to start')
  process.exit(1)
})
