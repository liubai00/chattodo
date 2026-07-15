import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
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
import type { LlmClient } from '@linx/platform-llm'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeChatPlugin } from '../src/routes/chat.routes.js'

const alice: AuthUser = { id: 'uA', name: 'Alice', accountName: 'alice', email: 'a@x.io', role: 'admin', createdAt: '2026-01-01T00:00:00' }

let client: PGlite
let db: Queryable
let idc = 0
const FIXED = new Date('2026-07-15T09:00:00')

async function legacyStub(): Promise<FastifyInstance> {
  const app = Fastify()
  app.post('/api/chat', async () => ({ from: 'legacy' }))
  app.setNotFoundHandler(async (_r, reply) => reply.status(404).send({ error: 'legacy 404' }))
  await app.ready()
  return app
}

async function buildWith(target: 'new' | 'legacy'): Promise<FastifyInstance> {
  return buildApi({
    legacyApp: await legacyStub(),
    migratedPlugins: [
      makeChatPlugin({
        db,
        publish: () => {},
        publishMany: () => {},
        clock: () => FIXED,
        genId: (p) => `${p}_t${++idc}`,
      }),
    ],
    registry: new RouteRegistry({ groups: { chat: target } }),
    auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
  })
}
const auth = { authorization: 'Bearer tok' }

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  const all = [...TASKS_DDL, ...PROJECTS_DDL, ...SETTINGS_DDL, ...CONVERSATIONS_DDL, ...AI_CONFIG_DDL, ...AI_ERRORS_DDL, ...SOCIAL_DDL, ...COLLAB_DDL, ...NOTIFICATIONS_DDL]
  for (const s of all) await client.exec(s)
  await client.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, created_at TEXT)`)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO users (id,name,email,role,created_at) VALUES ('uA','Alice','a@x.io','admin','2026-01-01T00:00:00')`)
  idc = 0
})
afterEach(async () => {
  await client.close()
})

describe('Chat facade — POST /api/chat (rule path)', () => {
  it('capture: actionable+dated message → task entity + create_task performed + 2 persisted messages', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '明天下午3点前提交MVP文档评审' } })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.intent).toBe('capture')
      expect(body.entities[0]).toMatchObject({ type: 'task' })
      expect(body.entities[0].entity.dueAt).toBeTruthy() // detectDue filled 明天
      expect(body.conversationId).toBe('conv_uA')
      // 落库：user + agent 两条消息 + 一个 task
      const msgs = await db.execute(`SELECT role FROM chat_messages WHERE conversation_id = 'conv_uA' ORDER BY created_at`)
      expect(msgs.map((m) => (m as { role: string }).role)).toEqual(['user', 'agent'])
      const tasks = await db.execute(`SELECT * FROM tasks WHERE user_id = 'uA'`)
      expect(tasks).toHaveLength(1)
      const recs = await db.execute(`SELECT * FROM capture_records WHERE user_id = 'uA'`)
      expect(recs).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('identity question → identity reply, no model, no task', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '你是什么模型' } })
      expect(res.json().intent).toBe('identity')
      expect(res.json().reply).toContain('离线规则模式')
      expect(await db.execute(`SELECT * FROM tasks WHERE user_id = 'uA'`)).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  it('plan intent → plan array (empty when no tasks)', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '接下来两小时做什么' } })
      expect(res.json().intent).toBe('plan')
      expect(Array.isArray(res.json().plan)).toBe(true)
    } finally {
      await app.close()
    }
  })

  it('non_todo reference → isolated output, no task', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '可以借鉴 Cubox 的稍后读设计' } })
      expect(res.json().intent).toBe('capture')
      expect(res.json().entities[0].type).toBe('non_todo')
      expect(await db.execute(`SELECT * FROM tasks WHERE user_id = 'uA'`)).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  it('empty message → 400; rate-limit-friendly; unauthenticated → 401', async () => {
    const app = await buildWith('new')
    try {
      expect((await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '   ' } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'POST', url: '/api/chat', payload: { message: 'x' } })).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('registry chat=legacy → fall through', async () => {
    const app = await buildWith('legacy')
    try {
      expect((await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: 'x' } })).json()).toEqual({ from: 'legacy' })
    } finally {
      await app.close()
    }
  })
})

describe('Chat facade — LLM path (configured provider)', () => {
  const AGENT_JSON = '{"reply":"好的，已记为任务。","actions":[{"type":"create_task","title":"写季度总结","priority":2}]}'
  const fakeLlm: LlmClient = {
    async messagesText() { return AGENT_JSON },
    async streamText(_s, _t, _c, onToken) { if (onToken) onToken(AGENT_JSON); return AGENT_JSON },
    async messagesJson() { return JSON.parse(AGENT_JSON) },
    async complete() { return AGENT_JSON },
  }
  async function buildLlm(): Promise<FastifyInstance> {
    return buildApi({
      legacyApp: await legacyStub(),
      migratedPlugins: [makeChatPlugin({ db, publish: () => {}, publishMany: () => {}, llm: fakeLlm, clock: () => FIXED, genId: (p) => `${p}_t${++idc}` })],
      registry: new RouteRegistry({ groups: { chat: 'new' } }),
      auth: { resolveSession: async (t) => (t === 'tok' ? alice : undefined) },
    })
  }

  it('configured aiConfig → agent path → executes LLM create_task action', async () => {
    // 配置团队 LLM（provider≠rule + apiKey）→ useLlm=true
    await client.query(`INSERT INTO ai_config (id,provider,base_url,model,api_key,fallback_to_rule,updated_at) VALUES ('default','anthropic','','claude','k',1,'2026-07-15T09:00:00')`)
    const app = await buildLlm()
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat', headers: auth, payload: { message: '记一下写季度总结' } })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.intent).toBe('agent')
      expect(body.reply).toContain('已记为任务')
      expect(body.entities[0]).toMatchObject({ type: 'task' })
      expect(body.performed[0]).toMatchObject({ type: 'create_task' })
      const tasks = await db.execute<{ title: string }>(`SELECT title FROM tasks WHERE user_id = 'uA'`)
      expect(tasks[0]?.title).toBe('写季度总结')
    } finally {
      await app.close()
    }
  })

  it('SSE agent path streams reply deltas then done', async () => {
    await client.query(`INSERT INTO ai_config (id,provider,base_url,model,api_key,fallback_to_rule,updated_at) VALUES ('default','anthropic','','claude','k',1,'2026-07-15T09:00:00')`)
    const app = await buildLlm()
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat/stream', headers: auth, payload: { message: '记一下写季度总结' } })
      expect(res.payload).toMatch(/event: status\ndata: \{"intent":"agent"\}\n\n/)
      expect(res.payload).toMatch(/event: delta\ndata: \{"text":"好的，已记为任务。"\}/)
      expect(res.payload).toMatch(/event: done\ndata: /)
    } finally {
      await app.close()
    }
  })
})

describe('Chat facade — POST /api/chat/stream (SSE, rule path)', () => {
  it('streams status then done with the full TurnResult', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat/stream', headers: auth, payload: { message: '明天下午3点前提交MVP文档评审' } })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/event-stream')
      const raw = res.payload
      // 帧格式 event:\ndata:\n\n
      expect(raw).toMatch(/event: status\ndata: \{"intent":"capture"\}\n\n/)
      expect(raw).toMatch(/event: done\ndata: /)
      // done 帧携带完整 TurnResult
      const doneLine = raw.split('\n\n').find((b) => b.startsWith('event: done'))!
      const payload = JSON.parse(doneLine.slice(doneLine.indexOf('data: ') + 6))
      expect(payload.intent).toBe('capture')
      expect(payload.entities[0].type).toBe('task')
      expect(payload.conversationId).toBe('conv_uA')
    } finally {
      await app.close()
    }
  })

  it('empty message on stream → 400 as ordinary JSON (not SSE)', async () => {
    const app = await buildWith('new')
    try {
      const res = await app.inject({ method: 'POST', url: '/api/chat/stream', headers: auth, payload: { message: '' } })
      expect(res.statusCode).toBe(400)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.json()).toEqual({ error: 'message is required' })
    } finally {
      await app.close()
    }
  })
})
