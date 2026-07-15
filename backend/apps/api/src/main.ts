import { loadConfig } from '@linx/platform-config'
import { baseLogger } from '@linx/platform-logger'
import { createDb } from '@linx/platform-db'
import { createEventBus, type LiveEvent } from '@linx/platform-eventbus'
import { createSessionStore } from '@linx/platform-auth'
import { makeSettingsRepo } from '@linx/infra-settings-pg'
import { buildLegacyApp } from '@linx/legacy'
import { buildApi, type MigratedPlugin } from './facade/build-api.js'
import { RouteRegistry } from './facade/route-registry.js'
import type { AuthPluginOptions } from './plugins/auth.plugin.js'
import { makeTasksPlugin } from './routes/tasks.routes.js'
import { makeProjectsPlugin } from './routes/projects.routes.js'
import { makeCapturePlugin } from './routes/capture.routes.js'
import { makeSocialPlugin } from './routes/social.routes.js'
import { makeCollabPlugin } from './routes/collab.routes.js'
import { makeNotificationsPlugin } from './routes/notifications.routes.js'
import { makeSettingsPlugin } from './routes/settings.routes.js'
import { makeSearchPlugin } from './routes/search.routes.js'
import { makePlanPlugin } from './routes/plan.routes.js'
import { makeConversationsPlugin } from './routes/conversations.routes.js'
import { makeAdminPlugin } from './routes/admin.routes.js'
import { makeChatPlugin } from './routes/chat.routes.js'
import { makeAiConfigPlugin } from './routes/ai.routes.js'

const config = loadConfig()

// 已迁移路由组：DB 就绪时全部置 'new'（权威）。未迁移的尾部路由（tasks 写路由、data.js 等）
// 仍在 Facade 里 404 → fall-through 到 legacy 子应用。
const MIGRATED_GROUPS = [
  'tasks',
  'projects',
  'capture',
  'social',
  'collab',
  'notifications',
  'settings',
  'search',
  'plan',
  'conversations',
  'admin',
  'chat',
  'ai',
] as const

async function main(): Promise<void> {
  // 默认 legacy；DB 就绪则把已迁移组翻 'new'；环境变量最后覆盖（可临时回滚某组到 legacy）。
  const registry = new RouteRegistry({ default: 'legacy' })
  const legacyApp = await buildLegacyApp()

  let auth: AuthPluginOptions | undefined
  const migratedPlugins: MigratedPlugin[] = []

  if (config.databaseUrl) {
    const db = await createDb({ databaseUrl: config.databaseUrl })

    // 统一鉴权：读现网同一 sessions 表；DB 异常 → fail-closed 到 401。
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

    // 事件总线（本地模式；多副本可注入 redis transport）。跨用户实时扇出用它。
    const bus = await createEventBus({ onError: (err) => baseLogger.error({ err }, '[linx-api] eventbus transport error') })
    const publish = (userId: string, payload: unknown): void => {
      bus.publish(userId, (payload ?? {}) as LiveEvent)
    }
    const publishMany = (userIds: readonly string[], payload: unknown): void => {
      bus.publishMany(userIds, (payload ?? {}) as LiveEvent)
    }

    const getPrivacySettings = async (userId: string): Promise<{ privacyMode: boolean; workspaceMode: 'work' | 'personal' }> => {
      const s = await makeSettingsRepo({ db, userId }).get()
      return {
        privacyMode: s?.privacyMode ?? false,
        workspaceMode: s?.workspaceMode === 'personal' ? 'personal' : 'work',
      }
    }

    migratedPlugins.push(
      makeTasksPlugin({ db, getPrivacySettings }),
      makeProjectsPlugin({ db }),
      makeCapturePlugin({ db }),
      makeSocialPlugin({ db, publish }),
      makeCollabPlugin({ db, publish, publishMany }),
      makeNotificationsPlugin({ db }),
      makeSettingsPlugin({ db }),
      makeSearchPlugin({ db }),
      makePlanPlugin({ db }),
      makeConversationsPlugin({ db }),
      makeAdminPlugin({ db }),
      makeChatPlugin({ db, publish, publishMany }),
      makeAiConfigPlugin({ db }),
    )
    for (const g of MIGRATED_GROUPS) registry.set(g, 'new')
    baseLogger.info({ groups: MIGRATED_GROUPS.length }, '[linx-api] migrated plugins live (new stack authoritative)')
  } else {
    baseLogger.warn('[linx-api] DATABASE_URL 未配置：以开放模式运行（无鉴权、无迁移插件，全 legacy），仅供本地。')
  }

  // 环境变量最后覆盖（LINX_ROUTE_<GROUP>=legacy 可把某组临时回滚）。
  registry.applyEnv(process.env)

  const app = await buildApi({ legacyApp, registry, migratedPlugins, ...(auth ? { auth } : {}) })

  await app.listen({ port: config.port, host: config.host })
  baseLogger.info({ port: config.port, host: config.host, auth: Boolean(auth), migrated: migratedPlugins.length }, '[linx-api] listening (facade)')

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
