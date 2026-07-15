import type { FastifyReply, FastifyRequest } from 'fastify'
import { makePrefixedId } from '@linx/kernel-ids'
import { makeIdentityRepo, type Queryable } from '@linx/infra-identity-pg'
import {
  createSessionStore,
  hashPassword,
  verifyPassword,
  extractBearer,
  type SessionStore,
} from '@linx/platform-auth'
import { createMemoryRateLimiter, type RateLimiter } from '@linx/platform-ratelimit'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface AuthPluginDeps {
  db: Queryable
  /** 会话存储；省略则 createSessionStore（读同一 sessions 表）。 */
  sessions?: SessionStore
  /** 注册/登录限流器；省略则进程内 10/10min。 */
  authLimiter?: RateLimiter
  clock?: () => Date
  genId?: (prefix: string) => string
}

const DEFAULT_AGENT = {
  soul: '冷静、主动、尊重用户注意力。默认行动导向，不把参考信息伪装成任务。先给判断，再给下一步，回复简洁。',
  preferences: '输出简洁；任务按截止时间和优先级排序；一次只追问一个最关键的问题。',
  workingStyle: 'GTD + 时间块。两小时为一个工作段，先难后易。',
  privacyRules: '工作 / 个人严格分离。隐私模式开启时，制定计划不读取个人范围数据。',
  followup: '任务不清楚时，只问一个最关键的问题：目标或完成标准。',
}
const WELCOME = '欢迎使用 LinX 灵信。把任何想法丢给我，我会判断它是任务、待澄清想法，还是非 todo 信息。'
const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Identity/Auth BC 已迁移路由（组 'auth'；authPlugin 视 /api/auth 为开放路径，不 401）。
 *   POST /api/auth/register  {name,email,password}
 *   POST /api/auth/login     {email,password}
 *   POST /api/auth/logout
 *   GET/PATCH /api/auth/me
 *   POST /api/auth/password  {oldPassword,newPassword}
 * 密码哈希/校验/会话经 platform-auth（argon2id + scrypt 兼容 + 机会式 rehash）。
 */
export function makeAuthPlugin(deps: AuthPluginDeps): MigratedPlugin {
  const { db } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((p: string): string => makePrefixedId(p)())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const identity = makeIdentityRepo({ db, clock, genId })
  const sessions = deps.sessions ?? createSessionStore({ db, clock })
  const limiter = deps.authLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 })

  const needUser = (req: FastifyRequest, reply: FastifyReply): { id: string; email: string } | undefined => {
    const u = req.user
    if (!u) {
      void reply.status(401).send({ error: 'unauthorized' })
      return undefined
    }
    return { id: u.id, email: u.email }
  }

  // 注册时为新用户播种默认 agent_profile / app_settings / 默认会话 + 欢迎语（承 legacy register tx）。
  const seedDefaults = async (id: string): Promise<void> => {
    const ts = nowIso()
    await db.execute(
      `INSERT INTO agent_profile (user_id,soul,memory,preferences,working_style,privacy_rules,default_followup_strategy,updated_at)
       VALUES ($1,$2,'',$3,$4,$5,$6,$7)`,
      [id, DEFAULT_AGENT.soul, DEFAULT_AGENT.preferences, DEFAULT_AGENT.workingStyle, DEFAULT_AGENT.privacyRules, DEFAULT_AGENT.followup, ts],
    )
    await db.execute(
      `INSERT INTO app_settings (user_id,workspace_mode,privacy_mode,default_view,ai_visibility,updated_at)
       VALUES ($1,'work',0,'chat','visible_scope_only',$2)`,
      [id, ts],
    )
    await db.execute(`INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ($1,$2,'默认对话',$3,$4)`, [
      'conv_' + id,
      id,
      ts,
      ts,
    ])
    await db.execute(
      `INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ($1,$2,$3,'agent',$4,0,$5)`,
      [genId('msg'), id, 'conv_' + id, WELCOME, ts],
    )
  }

  return {
    group: 'auth',
    register: async (app) => {
      app.post('/api/auth/register', async (req, reply) => {
        const b = (req.body ?? {}) as { name?: unknown; email?: unknown; password?: unknown }
        const email = String(b.email ?? '')
        if (!(await limiter.hit(`reg:${req.ip}:${email.toLowerCase()}`)).allowed) {
          return reply.status(429).send({ error: '尝试过于频繁，请 10 分钟后再试' })
        }
        const name = String(b.name ?? '').trim()
        if (!name) return reply.status(400).send({ error: '请输入显示名称' })
        if (name.length > 24) return reply.status(400).send({ error: '显示名称最长 24 字' })
        if (!email || !/.+@.+\..+/.test(email)) return reply.status(400).send({ error: '邮箱格式不正确' })
        const password = String(b.password ?? '')
        if (password.length < 8) return reply.status(400).send({ error: '密码至少 8 位' })
        if (await identity.findByEmail(email)) return reply.status(409).send({ error: '该邮箱已注册，请直接登录' })
        const first = (await identity.countAll()) === 0
        const id = await identity.create({ name, email, passwordHash: await hashPassword(password), role: first ? 'admin' : 'member' })
        await seedDefaults(id)
        const user = await identity.get(id)
        return { token: await sessions.issue(id), user }
      })

      app.post('/api/auth/login', async (req, reply) => {
        const b = (req.body ?? {}) as { email?: unknown; password?: unknown }
        const email = String(b.email ?? '')
        if (!(await limiter.hit(`login:${req.ip}:${email.toLowerCase()}`)).allowed) {
          return reply.status(429).send({ error: '尝试过于频繁，请 10 分钟后再试' })
        }
        const password = String(b.password ?? '')
        const row = await identity.findByEmail(email)
        if (!row) return reply.status(401).send({ error: '邮箱或密码不正确' })
        const v = await verifyPassword(password, row.passwordHash)
        if (!v.valid) return reply.status(401).send({ error: '邮箱或密码不正确' })
        if (v.needsRehash) await identity.setPasswordHash(row.id, await hashPassword(password)) // scrypt → argon2 机会式升级
        const { passwordHash: _p, ...user } = row
        return { token: await sessions.issue(row.id), user }
      })

      app.post('/api/auth/logout', async (req) => {
        const token = extractBearer(req.headers.authorization)
        if (token) await sessions.revoke(token)
        return { ok: true }
      })

      app.get('/api/auth/me', async (req, reply) => {
        if (!req.user) return reply.status(401).send({ error: 'unauthorized' })
        return req.user
      })

      app.patch('/api/auth/me', async (req, reply) => {
        const me = needUser(req, reply)
        if (!me) return
        const b = (req.body ?? {}) as { name?: unknown; accountName?: unknown }
        const patch: { name?: string; accountName?: string } = {}
        if ('name' in b) {
          const name = String(b.name ?? '').trim()
          if (!name) return reply.status(400).send({ error: '称呼不能为空' })
          if (name.length > 24) return reply.status(400).send({ error: '称呼最长 24 字' })
          patch.name = name
        }
        if ('accountName' in b) {
          const accountName = String(b.accountName ?? '').trim()
          if (!accountName) return reply.status(400).send({ error: '账户名不能为空' })
          if (accountName.length > 24) return reply.status(400).send({ error: '账户名最长 24 字' })
          if (!/^[\w.\-一-龥]+$/.test(accountName)) return reply.status(400).send({ error: '账户名只能含中英文、数字、_ . -' })
          patch.accountName = accountName
        }
        if (patch.name === undefined && patch.accountName === undefined) return req.user
        return identity.updateProfile(me.id, patch)
      })

      app.post('/api/auth/password', async (req, reply) => {
        const me = needUser(req, reply)
        if (!me) return
        const b = (req.body ?? {}) as { oldPassword?: unknown; newPassword?: unknown }
        const newPassword = String(b.newPassword ?? '')
        if (newPassword.length < 8) return reply.status(400).send({ error: '新密码至少 8 位' })
        const row = await identity.findByEmail(me.email)
        if (!row || !(await verifyPassword(String(b.oldPassword ?? ''), row.passwordHash)).valid) {
          return reply.status(400).send({ error: '当前密码不正确' })
        }
        await identity.setPasswordHash(me.id, await hashPassword(newPassword))
        const token = extractBearer(req.headers.authorization)
        await sessions.revokeAllForUser(me.id, token ?? undefined) // 改密后吊销其他会话
        return { ok: true }
      })
    },
  }
}
