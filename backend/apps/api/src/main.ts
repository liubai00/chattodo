import { loadConfig } from '@linx/platform-config'
import { baseLogger } from '@linx/platform-logger'
import { createDb } from '@linx/platform-db'
import { createEventBus, type LiveEvent } from '@linx/platform-eventbus'
import { createSessionStore } from '@linx/platform-auth'
import { makeSettingsRepo } from '@linx/infra-settings-pg'
import { bootstrapSchema } from './composition/ddl-bootstrap.js'
import { buildApi, type MigratedPlugin } from './facade/build-api.js'
import { RouteRegistry } from './facade/route-registry.js'
import type { AuthPluginOptions } from './plugins/auth.plugin.js'
import { makeTasksPlugin } from './routes/tasks.routes.js'
import { makeTaskWritesPlugin } from './routes/task-writes.routes.js'
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
import { makeEventsPlugin } from './routes/events.routes.js'
import { makeStatePlugin } from './routes/state.routes.js'
import { makeDataPlugin } from './routes/data.routes.js'
import { makeAuthPlugin } from './routes/auth.routes.js'
import { makeBaserowPlugin } from './routes/baserow.routes.js'
import {
  BaserowClient,
  bootstrapBaserowControlSchema,
  createBaserowControlStore,
} from '@linx/infra-baserow'
import { createTaskRepoFactory } from './composition/task-repo-factory.js'

const config = loadConfig()

// 已迁移路由组（全部 69 条路由的归属，恒置 'new' 权威；pg 与 PGlite 两种 DB 模式一致）。
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
  'events',
  'state',
  'data',
  'auth',
  'baserow',
] as const

async function main(): Promise<void> {
  // 默认 legacy；DB 就绪则把已迁移组翻 'new'；环境变量最后覆盖（可临时回滚某组到 legacy）。
  const registry = new RouteRegistry({ default: 'legacy' })

  let auth: AuthPluginOptions | undefined
  const migratedPlugins: MigratedPlugin[] = []

  // DB 双模式：有 DATABASE_URL 走 pg；否则 PGlite 本地零配置（进程内真 PG，数据落 PGLITE_DIR）。
  const db = await createDb({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir })
  {
    if (db.kind === 'pglite') {
      baseLogger.info({ dir: config.pgliteDir }, '[linx-api] 本地 PGlite 模式（零配置，仅供本地/演示）')
    }
    // PGlite 空库自建 schema；真 PG 仅在显式 LINX_DDL_BOOTSTRAP=1 时应用（全幂等，不动既有数据）。
    if (db.kind === 'pglite' || process.env.LINX_DDL_BOOTSTRAP === '1') await bootstrapSchema(db)

    // 统一鉴权：读现网同一 sessions 表；DB 异常 → fail-closed 到 401。
    const store = createSessionStore({ db })
    const baserowEnabled = config.tasks.backend === 'baserow'
    const baserowControl = baserowEnabled ? createBaserowControlStore(db) : undefined
    const baserowClient = baserowEnabled
      ? new BaserowClient({
          internalUrl: config.baserow.internalUrl,
          sharedSecret: config.baserow.sharedSecret,
        })
      : undefined
    const taskRepos = createTaskRepoFactory({
      db,
      ...(baserowClient ? { baserow: baserowClient } : {}),
    })
    if (baserowEnabled) await bootstrapBaserowControlSchema(db)
    auth = {
      resolveSession: async (token) => {
        try {
          return await store.resolve(token)
        } catch (err) {
          baseLogger.error({ err }, '[linx-api] session resolve failed → treating as unauthenticated')
          return undefined
        }
      },
      isOpenPath: (path) =>
        path === '/api/auth' ||
        path.startsWith('/api/auth/') ||
        path === '/api/health' ||
        path.startsWith('/api/health/') ||
        path === '/api/internal/baserow/exchange' ||
        path === '/api/internal/baserow/events',
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
      makeTasksPlugin({ db, taskRepos, getPrivacySettings }),
      makeTaskWritesPlugin({ db, taskRepos, publish, publishMany }),
      makeCapturePlugin({ db, taskRepos }),
      makeSocialPlugin({ db, publish }),
      makeNotificationsPlugin({ db }),
      makeSettingsPlugin({ db }),
      makeSearchPlugin({ db, taskRepos }),
      makePlanPlugin({ db, taskRepos }),
      makeConversationsPlugin({ db }),
      makeAdminPlugin({ db, taskRepos }),
      makeChatPlugin({ db, taskRepos, publish, publishMany }),
      makeAiConfigPlugin({ db }),
      // 实时 SSE 订阅：挂在与上面各插件 publish 相同的 bus 上，闭合发布→投递回环。
      makeEventsPlugin({ bus }),
      makeStatePlugin({ db, taskRepos }),
      makeDataPlugin({ db, taskRepos }),
      // 认证：复用同一 SessionStore（与 authPlugin 读同一 sessions 表）。
      makeAuthPlugin({
        db,
        sessions: store,
        requireInvite: baserowEnabled,
        ...(baserowControl ? { invitationGate: baserowControl } : {}),
      }),
    )
    if (!baserowEnabled) {
      migratedPlugins.push(
        makeProjectsPlugin({ db }),
        makeCollabPlugin({ db, publish, publishMany }),
      )
    }
    if (baserowControl && baserowClient) {
      migratedPlugins.push(
        makeBaserowPlugin({
          db,
          control: baserowControl,
          client: baserowClient,
          sharedSecret: config.baserow.sharedSecret,
          publicUrl: config.baserow.publicUrl,
          linxPublicUrl: config.baserow.linxPublicUrl,
          publish,
        }),
      )
    }
    for (const g of MIGRATED_GROUPS) registry.set(g, 'new')
    baseLogger.info({ groups: MIGRATED_GROUPS.length }, '[linx-api] migrated plugins live (new stack authoritative)')
  }

  // 环境变量最后覆盖（LINX_ROUTE_<GROUP>=legacy 可把某组临时回滚）。
  registry.applyEnv(process.env)

  const app = await buildApi({
    registry,
    migratedPlugins,
    ...(auth ? { auth } : {}),
  })

  await app.listen({ port: config.port, host: config.host })
  baseLogger.info(
    { port: config.port, host: config.host, auth: Boolean(auth), migrated: migratedPlugins.length, db: db.kind },
    '[linx-api] listening (facade)',
  )

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      baseLogger.info({ sig }, '[linx-api] shutting down')
      // 先关 HTTP（排空在途请求）再关 DB——持久化 PGlite 需在退出前落盘。
      void app
        .close()
        .then(() => db.close())
        .finally(() => process.exit(0))
    })
  }
}

main().catch((err: unknown) => {
  baseLogger.error({ err }, '[linx-api] failed to start')
  process.exit(1)
})
