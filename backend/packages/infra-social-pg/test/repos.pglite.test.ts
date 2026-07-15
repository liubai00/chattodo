import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { SOCIAL_DDL, makeFriendshipRepo, type Queryable } from '../src/index.js'

let client: PGlite
let db: Queryable

function steppingClock(startIso = '2026-07-15T09:00:00') {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 60_000)
}
let idCounter = 0
const seqId = (prefix: string): string => `${prefix}_test${++idCounter}`

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  // users 表由 identity BC 拥有，这里为 listForUser 的 LEFT JOIN 造一张最小表。
  await client.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT)`)
  for (const stmt of SOCIAL_DDL) await client.exec(stmt)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  idCounter = 0
})

afterEach(async () => {
  await client.close()
})

async function seedUsers() {
  await db.execute(`INSERT INTO users (id,name,email) VALUES ($1,$2,$3)`, ['uA', '阿离', 'a@x.io'])
  await db.execute(`INSERT INTO users (id,name,email) VALUES ($1,$2,$3)`, ['uB', 'Bella', 'b@x.io'])
}

function repo() {
  return makeFriendshipRepo({ db, clock: steppingClock(), genId: seqId })
}

describe('FriendshipRepo (PGlite)', () => {
  it('SOCIAL_DDL applies (incl. LEAST/GREATEST unique pair index)', async () => {
    const rows = await db.execute<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'friendships' ORDER BY indexname`,
    )
    expect(rows.map((r) => r.indexname)).toContain('idx_friend_pair')
  })

  it('insertPending → findPair (undirected) → findById', async () => {
    const r = repo()
    const fr = await r.insertPending('uA', 'uB')
    expect(fr).toMatchObject({ requesterId: 'uA', addresseeId: 'uB', status: 'pending', respondedAt: null })
    expect(fr.id).toBe('fr_test1')
    expect(await r.findPair('uB', 'uA')).toMatchObject({ id: fr.id }) // 无向
    expect(await r.findById(fr.id)).toMatchObject({ id: fr.id, status: 'pending' })
    expect(await r.findPair('uA', 'uC')).toBeUndefined()
  })

  it('unique pair index rejects a second row for the same pair (either direction)', async () => {
    const r = repo()
    await r.insertPending('uA', 'uB')
    await expect(r.insertPending('uB', 'uA')).rejects.toThrow()
  })

  it('setStatus stamps responded_at; acceptedFriendIds returns the other party', async () => {
    const r = repo()
    const fr = await r.insertPending('uA', 'uB')
    await r.setStatus(fr.id, 'accepted')
    const after = await r.findById(fr.id)
    expect(after?.status).toBe('accepted')
    expect(after?.respondedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/)
    expect(await r.acceptedFriendIds('uA')).toEqual(['uB'])
    expect(await r.acceptedFriendIds('uB')).toEqual(['uA'])
    expect(await r.acceptedFriendIds('uC')).toEqual([])
  })

  it('declined rows are excluded from acceptedFriendIds', async () => {
    const r = repo()
    const fr = await r.insertPending('uA', 'uB')
    await r.setStatus(fr.id, 'declined')
    expect(await r.acceptedFriendIds('uA')).toEqual([])
  })

  it('listForUser LEFT JOINs both parties names/emails', async () => {
    await seedUsers()
    const r = repo()
    const fr = await r.insertPending('uA', 'uB')
    const rows = await r.listForUser('uB')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: fr.id,
      requesterId: 'uA',
      addresseeId: 'uB',
      requesterName: '阿离',
      requesterEmail: 'a@x.io',
      addresseeName: 'Bella',
      addresseeEmail: 'b@x.io',
    })
  })

  it('listForUser tolerates a deleted counterpart (null name/email)', async () => {
    const r = repo()
    // 只建 uA，uB 不存在于 users
    await db.execute(`INSERT INTO users (id,name,email) VALUES ($1,$2,$3)`, ['uA', '阿离', 'a@x.io'])
    await r.insertPending('uA', 'uB')
    const rows = await r.listForUser('uA')
    expect(rows[0]?.addresseeName).toBeNull()
    expect(rows[0]?.requesterName).toBe('阿离')
  })

  it('reRequest flips direction, resets to pending, clears responded_at', async () => {
    const r = repo()
    const fr = await r.insertPending('uA', 'uB')
    await r.setStatus(fr.id, 'declined')
    await r.reRequest(fr.id, 'uB', 'uA') // 原 addressee 反向发起
    const after = await r.findById(fr.id)
    expect(after).toMatchObject({ requesterId: 'uB', addresseeId: 'uA', status: 'pending', respondedAt: null })
  })

  it('remove deletes the row', async () => {
    const r = repo()
    const fr = await r.insertPending('uA', 'uB')
    await r.remove(fr.id)
    expect(await r.findById(fr.id)).toBeUndefined()
  })
})
