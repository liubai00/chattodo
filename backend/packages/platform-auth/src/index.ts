// @linx/platform-auth — 密码哈希（argon2id + 旧 scrypt 透明 rehash）+ opaque 会话存储（修 P3）。
// 【线格式兼容】仅限 sessions 表（Strangler 期新旧共读同表）：
//  - token = randomBytes(32) hex；created_at/expires_at = 本地朴素 ISO（YYYY-MM-DDTHH:mm:ss），
//    与现网 lib/ids.js nowIso/daysFromNow 字典序可比（TEXT 比较 = 时序比较）。时区迁移见 P7。
// ⚠ password_hash 【非】向后兼容：argon2 串不含冒号，现网 legacy verifyPassword（split(':')）无法解析。
//    因此「登录时把旧 scrypt rehash 为 argon2id」的写入（P2 app-identity）开启前，必须先给现网
//    server/src/services/auth.js 的 verifyPassword 补 argon2 读分支并全量铺开（reader-before-writer），
//    否则混跑期已迁移用户在 legacy 登录/改密路径会被锁死。resolve 只查 token，不受影响。
// 边界：platform 仅依赖 kernel/contracts + 外部库；DB/Cache 经结构化端口注入，不 import 其它 platform-*。
import { hash as argon2Hash, verify as argon2Verify, type Options } from '@node-rs/argon2'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// 显式钉死 argon2id 代价参数（≥ OWASP 最低 m=19456KiB/t=2/p=1），不依赖库默认——
// 其类型声明的默认值更弱（m=4096/t=3），版本升级可能悄悄降到 OWASP 线以下。
// algorithm 省略 → 用库默认 Argon2id（已验证输出前缀 $argon2id$）。
const ARGON2_OPTIONS: Options = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

// ── 密码哈希 ──

/** 生成 argon2id 哈希（新账号 / rehash 目标格式）。 */
export function hashPassword(password: string): Promise<string> {
  return argon2Hash(String(password), ARGON2_OPTIONS)
}

export interface VerifyResult {
  valid: boolean
  /** true = 校验通过但为旧格式（scrypt），应 rehash 为 argon2id。 */
  needsRehash: boolean
}

/** 校验密码，自动识别 argon2 与旧 scrypt（salt:hash hex）两种存储格式。 */
export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  if (typeof stored !== 'string' || stored.length === 0) return { valid: false, needsRehash: false }
  if (stored.startsWith('$argon2')) {
    try {
      return { valid: await argon2Verify(stored, String(password)), needsRehash: false }
    } catch {
      return { valid: false, needsRehash: false }
    }
  }
  // 旧格式：scryptSync(pw, salt, 64) 的 "salthex:hashhex"（承接现网 verifyPassword）
  const valid = verifyLegacyScrypt(password, stored)
  return { valid, needsRehash: valid }
}

function verifyLegacyScrypt(password: string, stored: string): boolean {
  try {
    const parts = stored.split(':')
    const salt = parts[0]
    const hashHex = parts[1]
    if (!salt || !hashHex) return false
    // hex 解码不抛：非法/奇数长度会截断（'zz'→空、'abc'→1字节），下面的长度校验兜底。
    const expect = Buffer.from(hashHex, 'hex')
    if (expect.length === 0) return false
    const actual = scryptSync(String(password), salt, 64)
    return actual.length === expect.length && timingSafeEqual(actual, expect)
  } catch {
    // 防御：非串密码等异常输入优雅返回 false（对齐现网 String(pw) 语义），不冒泡成 500。
    return false
  }
}

/** 从 Authorization 头提取 Bearer token（承接现网正则）。 */
export function extractBearer(authorization: string | undefined | null): string | undefined {
  if (!authorization) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(authorization)
  return m ? m[1] : undefined
}

// ── 会话存储（opaque token，PG 真相源）──

export interface AuthUser {
  id: string
  name: string
  accountName: string
  email: string
  role: string
  createdAt: string
}

/** 结构化 DB 端口（platform-db 的 DbHandle 结构性满足：execute(text,params)→rows[]）。 */
export interface Db {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

interface UserRow {
  id: string
  name: string
  account_name: string | null
  email: string
  role: string
  created_at: string
}

function toUser(r: UserRow): AuthUser {
  return {
    id: r.id,
    name: r.name,
    accountName: r.account_name || r.name,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** 本地朴素 ISO（秒精度），与现网 nowIso（分精度，秒恒 00）字典序可比。 */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export interface SessionStoreOptions {
  db: Db
  /** 会话有效天数，默认 30（承接现网 SESSION_DAYS）。 */
  sessionDays?: number
  /** 时间源（注入以便测试确定化）；默认 () => new Date()。 */
  clock?: () => Date
}

export interface SessionStore {
  /** 签发新会话，返回 opaque token。 */
  issue(userId: string): Promise<string>
  /** 解析 token → 用户；无效/过期返回 undefined。 */
  resolve(token: string | undefined): Promise<AuthUser | undefined>
  /** 吊销单个会话。 */
  revoke(token: string): Promise<void>
  /** 吊销某用户全部会话（可保留一个当前 token）——改密后防盗用。 */
  revokeAllForUser(userId: string, exceptToken?: string): Promise<void>
  /** 清理过期会话。 */
  gcExpired(): Promise<void>
}

export function createSessionStore(opts: SessionStoreOptions): SessionStore {
  const { db } = opts
  const sessionDays = opts.sessionDays ?? 30
  const clock = opts.clock ?? ((): Date => new Date())

  return {
    async issue(userId: string): Promise<string> {
      const base = clock()
      const created = localIso(base)
      const expiry = new Date(base)
      expiry.setDate(expiry.getDate() + sessionDays)
      const expires = localIso(expiry)
      const token = randomBytes(32).toString('hex')
      await db.execute('DELETE FROM sessions WHERE expires_at <= $1', [created]) // GC 过期会话
      await db.execute(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
        [token, userId, created, expires],
      )
      return token
    },

    async resolve(token: string | undefined): Promise<AuthUser | undefined> {
      if (!token) return undefined
      const rows = await db.execute<UserRow>(
        `SELECT u.id, u.name, u.account_name, u.email, u.role, u.created_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = $1 AND s.expires_at > $2`,
        [token, localIso(clock())],
      )
      const row = rows[0]
      return row ? toUser(row) : undefined
    },

    async revoke(token: string): Promise<void> {
      await db.execute('DELETE FROM sessions WHERE token = $1', [token])
    },

    async revokeAllForUser(userId: string, exceptToken?: string): Promise<void> {
      if (exceptToken !== undefined) {
        await db.execute('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [
          userId,
          exceptToken,
        ])
      } else {
        await db.execute('DELETE FROM sessions WHERE user_id = $1', [userId])
      }
    },

    async gcExpired(): Promise<void> {
      await db.execute('DELETE FROM sessions WHERE expires_at <= $1', [localIso(clock())])
    },
  }
}
