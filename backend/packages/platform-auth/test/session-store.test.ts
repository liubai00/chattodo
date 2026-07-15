import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { createSessionStore, type Db, type SessionStore } from '../src/index.js'

// 将 PGlite 包成 platform-auth 的 Db 端口（execute → rows[]）
function pgliteDb(client: PGlite): Db {
  return {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
}

let client: PGlite

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  await client.exec(`
    CREATE TABLE users (
      id text PRIMARY KEY, name text NOT NULL, account_name text NOT NULL DEFAULT '',
      email text NOT NULL UNIQUE, password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'member', created_at text NOT NULL
    );
    CREATE TABLE sessions (
      token text PRIMARY KEY, user_id text NOT NULL,
      created_at text NOT NULL, expires_at text NOT NULL
    );
    INSERT INTO users (id,name,account_name,email,password_hash,role,created_at)
      VALUES ('u1','Alice','alice','a@x.com','$argon2id$stub','admin','2026-01-01T00:00:00');
  `)
})

afterEach(async () => {
  await client.close()
})

function store(clockDate: Date): SessionStore {
  return createSessionStore({ db: pgliteDb(client), clock: () => clockDate, sessionDays: 30 })
}

describe('SessionStore (PGlite)', () => {
  it('issue → resolve returns the user (accountName from account_name)', async () => {
    const s = store(new Date('2026-07-15T10:00:00'))
    const token = await s.issue('u1')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const user = await s.resolve(token)
    expect(user).toMatchObject({ id: 'u1', name: 'Alice', accountName: 'alice', role: 'admin' })
  })

  it('resolve returns undefined for unknown / empty token', async () => {
    const s = store(new Date('2026-07-15T10:00:00'))
    expect(await s.resolve('nope')).toBeUndefined()
    expect(await s.resolve(undefined)).toBeUndefined()
    expect(await s.resolve('')).toBeUndefined()
  })

  it('revoke invalidates a session', async () => {
    const s = store(new Date('2026-07-15T10:00:00'))
    const token = await s.issue('u1')
    await s.revoke(token)
    expect(await s.resolve(token)).toBeUndefined()
  })

  it('resolve treats expired sessions as invalid', async () => {
    // 在过去签发（sessionDays=30 → 过期时刻仍在更远的过去之后？用负天数模拟已过期）
    const issuer = createSessionStore({
      db: pgliteDb(client),
      clock: () => new Date('2026-07-15T10:00:00'),
      sessionDays: -1, // 昨天过期
    })
    const token = await issuer.issue('u1')
    const resolver = store(new Date('2026-07-15T10:00:00'))
    expect(await resolver.resolve(token)).toBeUndefined()
  })

  it('revokeAllForUser keeps the excepted token, drops the rest', async () => {
    const s = store(new Date('2026-07-15T10:00:00'))
    const keep = await s.issue('u1')
    const drop1 = await s.issue('u1')
    const drop2 = await s.issue('u1')
    await s.revokeAllForUser('u1', keep)
    expect(await s.resolve(keep)).toBeDefined()
    expect(await s.resolve(drop1)).toBeUndefined()
    expect(await s.resolve(drop2)).toBeUndefined()
  })

  it('revokeAllForUser without except drops everything', async () => {
    const s = store(new Date('2026-07-15T10:00:00'))
    const t1 = await s.issue('u1')
    await s.revokeAllForUser('u1')
    expect(await s.resolve(t1)).toBeUndefined()
  })

  it('gcExpired removes expired rows but keeps live ones', async () => {
    const live = store(new Date('2026-07-15T10:00:00'))
    const liveToken = await live.issue('u1')
    // 手插一条已过期会话
    await client.query(
      'INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)',
      ['dead', 'u1', '2026-01-01T00:00:00', '2026-01-02T00:00:00'],
    )
    await live.gcExpired()
    const rows = await client.query<{ token: string }>('SELECT token FROM sessions ORDER BY token')
    expect(rows.rows.map((r) => r.token)).toEqual([liveToken].sort())
  })
})
