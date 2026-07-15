import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  COLLAB_DDL,
  makeCollaboratorRepo,
  makeAutoRuleRepo,
  type Queryable,
} from '../src/index.js'

let client: PGlite
let db: Queryable

function steppingClock(startIso = '2026-07-15T09:00:00') {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 60_000)
}
let idc = 0
const seqId = (p: string): string => `${p}_t${++idc}`

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  await client.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)`)
  await client.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, due_at TEXT)`)
  for (const stmt of COLLAB_DDL) await client.exec(stmt)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  await client.query(`INSERT INTO users (id,name) VALUES ('uOwner','Owner'),('uBob','Bob'),('uCarol','Carol')`)
  await client.query(`INSERT INTO tasks (id,user_id,title,due_at) VALUES ('t1','uOwner','写方案','2026-07-20T18:00:00')`)
  idc = 0
})
afterEach(async () => {
  await client.close()
})

function ownerRepo(nowMs?: () => number) {
  return makeCollaboratorRepo({
    db,
    userId: 'uOwner',
    clock: steppingClock(),
    genId: seqId,
    ...(nowMs ? { nowMs } : {}),
  })
}

describe('CollaboratorRepo — invite', () => {
  it('fresh invite creates a pending row', async () => {
    const r = await ownerRepo().invite('t1', 'uBob')
    expect(r).not.toBeNull()
    expect(r!.reused).toBe(false)
    expect(r!.collab).toMatchObject({ taskId: 't1', ownerId: 'uOwner', userId: 'uBob', invitedBy: 'uOwner', status: 'pending', remind: true })
  })
  it('self-invite or non-owned task → null', async () => {
    expect(await ownerRepo().invite('t1', 'uOwner')).toBeNull()
    expect(await ownerRepo().invite('tX', 'uBob')).toBeNull()
  })
  it('re-invite pending/accepted → reused', async () => {
    const repo = ownerRepo()
    await repo.invite('t1', 'uBob')
    const again = await repo.invite('t1', 'uBob')
    expect(again).toMatchObject({ reused: true })
  })
  it('declined within cooldown → null; past cooldown → reopens pending', async () => {
    const repo = ownerRepo()
    const first = await repo.invite('t1', 'uBob')
    const cid = first!.collab.id
    // Bob declines
    await makeCollaboratorRepo({ db, userId: 'uBob', clock: steppingClock('2026-07-15T10:00:00'), genId: seqId }).respond(cid, 'declined')
    // responded_at ≈ 2026-07-15T10:00:00 local. Cooldown check uses injected nowMs.
    const respondedMs = new Date('2026-07-15T10:00:00').getTime()
    // within cooldown (1h later)
    const cool = ownerRepo(() => respondedMs + 3600_000)
    expect(await cool.invite('t1', 'uBob')).toBeNull()
    // past cooldown (25h later)
    const warm = ownerRepo(() => respondedMs + 25 * 3600_000)
    const reopened = await warm.invite('t1', 'uBob')
    expect(reopened).toMatchObject({ reused: false })
    expect(reopened!.collab.status).toBe('pending')
    expect(reopened!.collab.id).toBe(cid) // 同一行重开
  })
})

describe('CollaboratorRepo — respond', () => {
  async function pending(): Promise<string> {
    return (await ownerRepo().invite('t1', 'uBob'))!.collab.id
  }
  function bob() {
    return makeCollaboratorRepo({ db, userId: 'uBob', clock: steppingClock('2026-07-15T11:00:00'), genId: seqId })
  }
  it('accept sets accepted + remind flag', async () => {
    const cid = await pending()
    const c = await bob().respond(cid, 'accepted', false)
    expect(c).toMatchObject({ status: 'accepted', remind: false })
  })
  it('follow sets following', async () => {
    const cid = await pending()
    expect((await bob().respond(cid, 'following'))?.status).toBe('following')
  })
  it('wrong user or non-pending → undefined', async () => {
    const cid = await pending()
    expect(await ownerRepo().respond(cid, 'accepted')).toBeUndefined() // owner ≠ addressee
    await bob().respond(cid, 'accepted')
    expect(await bob().respond(cid, 'declined')).toBeUndefined() // 已非 pending
  })
})

describe('CollaboratorRepo — watchers / leave / accepted', () => {
  it('watchersOf = owner + accepted + following (excludes pending/declined/left)', async () => {
    const repo = ownerRepo()
    const bobInv = (await repo.invite('t1', 'uBob'))!.collab.id
    const carolInv = (await repo.invite('t1', 'uCarol'))!.collab.id
    await makeCollaboratorRepo({ db, userId: 'uBob', clock: steppingClock('2026-07-15T11:00:00'), genId: seqId }).respond(bobInv, 'accepted')
    await makeCollaboratorRepo({ db, userId: 'uCarol', clock: steppingClock('2026-07-15T11:00:00'), genId: seqId }).respond(carolInv, 'following')
    const w = await repo.watchersOf('t1')
    expect(new Set(w)).toEqual(new Set(['uOwner', 'uBob', 'uCarol']))
  })
  it('pending collaborator is NOT a watcher but IS in acceptedUsersOf', async () => {
    const repo = ownerRepo()
    await repo.invite('t1', 'uBob') // pending
    expect(await repo.watchersOf('t1')).toEqual(['uOwner'])
    expect(await repo.acceptedUsersOf('t1')).toEqual(['uBob'])
  })
  it('leave flips accepted→left; watchers drop the leaver', async () => {
    const repo = ownerRepo()
    const cid = (await repo.invite('t1', 'uBob'))!.collab.id
    const bob = makeCollaboratorRepo({ db, userId: 'uBob', clock: steppingClock('2026-07-15T11:00:00'), genId: seqId })
    await bob.respond(cid, 'accepted')
    expect(await bob.leave('t1')).toBe(true)
    expect(await repo.watchersOf('t1')).toEqual(['uOwner'])
    expect(await bob.leave('t1')).toBe(false) // 已 left，无可退出行
  })
})

describe('CollaboratorRepo — read projections', () => {
  it('forTask joins member name; myPending joins task/inviter', async () => {
    const repo = ownerRepo()
    await repo.invite('t1', 'uBob')
    const list = await repo.forTask('t1')
    expect(list[0]).toMatchObject({ userId: 'uBob', userName: 'Bob' })
    const bob = makeCollaboratorRepo({ db, userId: 'uBob', clock: steppingClock('2026-07-15T11:00:00'), genId: seqId })
    const pend = await bob.myPending()
    expect(pend[0]).toMatchObject({ taskTitle: '写方案', taskDueAt: '2026-07-20T18:00:00', inviterName: 'Owner' })
  })
  it('myAcceptedMap maps taskId→{remind,from}', async () => {
    const repo = ownerRepo()
    const cid = (await repo.invite('t1', 'uBob'))!.collab.id
    const bob = makeCollaboratorRepo({ db, userId: 'uBob', clock: steppingClock('2026-07-15T11:00:00'), genId: seqId })
    await bob.respond(cid, 'accepted', true)
    const m = await bob.myAcceptedMap()
    expect(m.get('t1')).toMatchObject({ remind: true, from: 'Owner' })
  })
})

describe('AutoRuleRepo', () => {
  it('create → all (DESC) → remove', async () => {
    const rules = makeAutoRuleRepo({ db, userId: 'uOwner', clock: steppingClock(), genId: seqId })
    const r = await rules.create('合同', 'uBob', 'Bob')
    expect(r).toMatchObject({ keyword: '合同', action: 'invite', targetId: 'uBob', targetName: 'Bob' })
    expect(await rules.all()).toHaveLength(1)
    await rules.remove(r.id)
    expect(await rules.all()).toHaveLength(0)
  })
  it('rules are per-user scoped', async () => {
    await makeAutoRuleRepo({ db, userId: 'uOwner', clock: steppingClock(), genId: seqId }).create('合同', 'uBob', 'Bob')
    const other = makeAutoRuleRepo({ db, userId: 'uBob', clock: steppingClock(), genId: seqId })
    expect(await other.all()).toHaveLength(0)
  })
})
