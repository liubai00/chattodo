import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { IDENTITY_DDL, makeIdentityRepo, type Queryable } from '../src/index.js'

let client: PGlite
let db: Queryable
const clock = () => new Date('2026-07-15T10:00:00')
let n = 0

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of IDENTITY_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  n = 0
})
afterEach(async () => {
  await client.close()
})

const repo = () => makeIdentityRepo({ db, clock, genId: (p) => `${p}_${++n}` })

describe('IdentityRepo', () => {
  it('countAll → create (email lowercased) → findByEmail (with hash) → get (no hash)', async () => {
    const r = repo()
    expect(await r.countAll()).toBe(0)
    const id = await r.create({ name: 'Alice', email: 'Alice@X.io', passwordHash: 'HASH', role: 'admin' })
    expect(id).toBe('u_1')
    expect(await r.countAll()).toBe(1)
    const row = await r.findByEmail('alice@x.io')
    expect(row).toMatchObject({ id, name: 'Alice', accountName: 'Alice', email: 'alice@x.io', role: 'admin', passwordHash: 'HASH' })
    const user = await r.get(id)
    expect(user).toMatchObject({ id, name: 'Alice', accountName: 'Alice' })
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('findByEmail is case-insensitive on lookup + unknown → undefined', async () => {
    const r = repo()
    await r.create({ name: 'Bob', email: 'bob@x.io', passwordHash: 'h', role: 'member' })
    expect(await r.findByEmail('BOB@X.io')).toMatchObject({ name: 'Bob' })
    expect(await r.findByEmail('ghost@x.io')).toBeUndefined()
  })

  it('updateProfile updates only non-empty name/accountName', async () => {
    const r = repo()
    const id = await r.create({ name: 'Old', email: 'o@x.io', passwordHash: 'h', role: 'member' })
    expect(await r.updateProfile(id, { accountName: 'newacct' })).toMatchObject({ name: 'Old', accountName: 'newacct' })
    expect(await r.updateProfile(id, { name: '新称呼' })).toMatchObject({ name: '新称呼', accountName: 'newacct' })
    // 空值不改
    expect(await r.updateProfile(id, { name: '  ' })).toMatchObject({ name: '新称呼' })
  })

  it('setPasswordHash rotates the stored hash', async () => {
    const r = repo()
    const id = await r.create({ name: 'X', email: 'x@x.io', passwordHash: 'old', role: 'member' })
    await r.setPasswordHash(id, 'new')
    expect((await r.findByEmail('x@x.io'))?.passwordHash).toBe('new')
  })
})
