import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { TASKS_DDL, type Queryable } from '@linx/infra-tasks-pg'
import { PROJECTS_DDL } from '@linx/infra-projects-pg'
import { SETTINGS_DDL } from '@linx/infra-settings-pg'
import { CONVERSATIONS_DDL } from '@linx/infra-conversations-pg'
import { AI_CONFIG_DDL } from '@linx/infra-ai-config-pg'
import { AI_ERRORS_DDL } from '@linx/infra-ai-errors-pg'
import { SOCIAL_DDL } from '@linx/infra-social-pg'
import { COLLAB_DDL } from '@linx/infra-collab-pg'
import { NOTIFICATIONS_DDL } from '@linx/infra-notifications-pg'
import type { AuthUser } from '@linx/platform-auth'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeTasksPlugin } from '../src/routes/tasks.routes.js'
import { makeProjectsPlugin } from '../src/routes/projects.routes.js'
import { makeCapturePlugin } from '../src/routes/capture.routes.js'
import { makeSocialPlugin } from '../src/routes/social.routes.js'
import { makeCollabPlugin } from '../src/routes/collab.routes.js'
import { makeNotificationsPlugin } from '../src/routes/notifications.routes.js'
import { makeSettingsPlugin } from '../src/routes/settings.routes.js'
import { makeSearchPlugin } from '../src/routes/search.routes.js'
import { makePlanPlugin } from '../src/routes/plan.routes.js'
import { makeConversationsPlugin } from '../src/routes/conversations.routes.js'
import { makeAdminPlugin } from '../src/routes/admin.routes.js'
import { makeChatPlugin } from '../src/routes/chat.routes.js'
import { makeAiConfigPlugin } from '../src/routes/ai.routes.js'
import Fastify, { type FastifyInstance } from 'fastify'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable

const GROUPS = ['tasks', 'projects', 'capture', 'social', 'collab', 'notifications', 'settings', 'search', 'plan', 'conversations', 'admin', 'chat', 'ai']

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404', code: 'NOT_FOUND' }))
  await app.ready()
  return app
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of [...TASKS_DDL, ...PROJECTS_DDL, ...SETTINGS_DDL, ...CONVERSATIONS_DDL, ...AI_CONFIG_DDL, ...AI_ERRORS_DDL, ...SOCIAL_DDL, ...COLLAB_DDL, ...NOTIFICATIONS_DDL]) await client.exec(s)
  await client.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, account_name TEXT, created_at TEXT)`)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO users (id,name,email,role,account_name,created_at) VALUES ('uA','Alice','a@x.io','admin','alice','2026-01-01T00:00:00')`)
  await client.query(`INSERT INTO app_settings (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
  await client.query(`INSERT INTO agent_profile (user_id, updated_at) VALUES ('uA','2026-07-01T00:00:00')`)
})
afterEach(async () => {
  await client.close()
})

/** 复刻 main.ts 的组合：全部 13 个已迁移插件同挂一台 Fastify，registry 全 'new'。 */
async function buildAll(): Promise<FastifyInstance> {
  const getPrivacySettings = async (): Promise<{ privacyMode: boolean; workspaceMode: 'work' | 'personal' }> => ({ privacyMode: false, workspaceMode: 'work' })
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [
      makeTasksPlugin({ db, getPrivacySettings }),
      makeProjectsPlugin({ db }),
      makeCapturePlugin({ db }),
      makeSocialPlugin({ db, publish: () => {} }),
      makeCollabPlugin({ db, publish: () => {}, publishMany: () => {} }),
      makeNotificationsPlugin({ db }),
      makeSettingsPlugin({ db }),
      makeSearchPlugin({ db }),
      makePlanPlugin({ db }),
      makeConversationsPlugin({ db }),
      makeAdminPlugin({ db }),
      makeChatPlugin({ db, publish: () => {}, publishMany: () => {} }),
      makeAiConfigPlugin({ db }),
    ],
    registry: new RouteRegistry({ groups: Object.fromEntries(GROUPS.map((g) => [g, 'new'])) }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

describe('Composition smoke — all 13 migrated plugins co-registered (main.ts shape)', () => {
  it('builds without route collision and every group resolves (not legacy 404)', async () => {
    const app = await buildAll() // 若有重复路由，此处 buildApi 会抛
    try {
      // 从不同 BC 各取一条代表性路由，确认都由新栈处理（非 legacy fall-through）。
      const checks: Array<[string, string, number]> = [
        ['GET', '/api/notifications', 200],
        ['GET', '/api/settings', 200],
        ['GET', '/api/agent', 200],
        ['GET', '/api/friends', 200],
        ['GET', '/api/team', 200],
        ['GET', '/api/invites', 200],
        ['GET', '/api/auto-rules', 200],
        ['GET', '/api/tasks', 200],
        ['GET', '/api/search?q=x', 200],
        ['GET', '/api/mentions?q=x', 200],
        ['GET', '/api/ai/config', 200],
        ['GET', '/api/admin/overview', 200],
        ['GET', '/api/conversations', 200],
      ]
      for (const [method, url, code] of checks) {
        const res = await app.inject({ method: method as 'GET', url, headers: auth })
        expect(res.statusCode, `${method} ${url}`).toBe(code)
        expect(res.json(), `${method} ${url} should not be legacy 404`).not.toMatchObject({ error: 'legacy 404' })
      }
      // POST 路由
      expect((await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '买牛奶明天' } })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: '/api/plan', headers: auth, payload: {} })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { name: '新项目' } })).statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('an unmigrated route still falls through to legacy', async () => {
    const app = await buildAll()
    try {
      // /api/tasks/:id/detail 未迁移 → Facade 404 → legacy fall-through（此处 legacy stub 也 404，但走的是 fall-through）。
      const res = await app.inject({ method: 'GET', url: '/api/tasks/xyz/detail', headers: auth })
      expect(res.json()).toMatchObject({ error: 'legacy 404' })
    } finally {
      await app.close()
    }
  })
})
