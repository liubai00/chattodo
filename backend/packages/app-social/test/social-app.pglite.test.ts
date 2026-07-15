import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { SOCIAL_DDL, makeFriendshipRepo, type Queryable } from '@linx/infra-social-pg'
import {
  makeSocialApp,
  type SocialApp,
  type SocialNotification,
  type FriendActor,
} from '../src/index.js'

let client: PGlite
let db: Queryable
let app: SocialApp

// —— 跨界端口的可观测替身 ——
interface PushCall { userId: string; n: SocialNotification }
let pushes: PushCall[]
let handledFor: Array<{ ref: string; userId: string }>
let handled: string[]
let published: string[]
let closedPolicy: Set<string>
const USERS: Record<string, { id: string; name: string; email: string }> = {
  uA: { id: 'uA', name: '阿离', email: 'a@x.io' },
  uB: { id: 'uB', name: 'Bella', email: 'b@x.io' },
  uC: { id: 'uC', name: 'Cyan', email: 'c@x.io' },
  uD: { id: 'uD', name: 'Delta', email: 'd@x.io' },
}

function steppingClock(startIso = '2026-07-15T09:00:00') {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 60_000)
}
let idCounter = 0

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  await client.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT)`)
  for (const stmt of SOCIAL_DDL) await client.exec(stmt)
  for (const u of Object.values(USERS)) {
    await client.query(`INSERT INTO users (id,name,email) VALUES ($1,$2,$3)`, [u.id, u.name, u.email])
  }
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  idCounter = 0
  pushes = []
  handledFor = []
  handled = []
  published = []
  closedPolicy = new Set()

  const friendships = makeFriendshipRepo({
    db,
    clock: steppingClock(),
    genId: (p) => `${p}_test${++idCounter}`,
  })
  app = makeSocialApp({
    friendships,
    users: {
      async byId(id) {
        const u = USERS[id]
        return u ? { id: u.id, name: u.name, email: u.email } : undefined
      },
      async byEmailLower(em) {
        const u = Object.values(USERS).find((x) => x.email.toLowerCase() === em)
        return u ? { id: u.id } : undefined
      },
    },
    notifier: {
      async push(userId, n) {
        pushes.push({ userId, n })
      },
      async markHandledFor(ref, userId) {
        handledFor.push({ ref, userId })
      },
      async markHandled(ref) {
        handled.push(ref)
      },
    },
    publishFriends: (userId) => published.push(userId),
    friendPolicyClosed: async (userId) => closedPolicy.has(userId),
  })
})

afterEach(async () => {
  await client.close()
})

const actor = (id: string): FriendActor => ({ id, name: USERS[id]!.name })

describe('SocialApp — requestByEmail / requestById guards', () => {
  it('bad email → bad_email (no lookup)', async () => {
    const r = await app.requestByEmail(actor('uA'), 'notanemail')
    expect(r).toMatchObject({ code: 'bad_email' })
  })
  it('unknown email → not_found', async () => {
    const r = await app.requestByEmail(actor('uA'), 'ghost@x.io')
    expect(r).toMatchObject({ code: 'not_found' })
  })
  it('self add → self', async () => {
    const r = await app.requestById(actor('uA'), 'uA')
    expect(r).toMatchObject({ code: 'self' })
  })
  it('unknown id → not_found', async () => {
    const r = await app.requestById(actor('uA'), 'nope')
    expect(r).toMatchObject({ code: 'not_found' })
  })
})

describe('SocialApp — fresh request', () => {
  it('creates pending + notifies target with friend_request action + publishes', async () => {
    const r = await app.requestByEmail(actor('uA'), 'B@X.io') // 大小写不敏感
    expect(r).toMatchObject({ friendship: { status: 'pending' }, target: { id: 'uB' } })
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toMatchObject({
      userId: 'uB',
      n: { type: 'friend', actionType: 'friend_request' },
    })
    // actionRef 指向新建关系
    const fid = (r as { friendship: { id: string } }).friendship.id
    expect(pushes[0]!.n.actionRef).toBe(fid)
    expect(published).toEqual(['uB'])
    expect(await app.overview('uB')).toMatchObject({ incoming: [{ friendshipId: fid, id: 'uA' }] })
  })

  it('closed policy blocks a fresh request (no row, no notify)', async () => {
    closedPolicy.add('uB')
    const r = await app.requestById(actor('uA'), 'uB')
    expect(r).toMatchObject({ code: 'closed', target: { id: 'uB' } })
    expect(pushes).toHaveLength(0)
    expect((await app.overview('uA')).outgoing).toHaveLength(0)
  })
})

describe('SocialApp — reverse pending auto-accepts', () => {
  it('uB requested uA; then uA requests uB → auto accepted (ignores uA-closed)', async () => {
    closedPolicy.add('uB') // 不应影响：请求正是 uB 发起的方向
    await app.requestById(actor('uB'), 'uA')
    pushes = []; published = []
    const r = await app.requestById(actor('uA'), 'uB')
    expect(r).toMatchObject({ autoAccepted: true, friendship: { status: 'accepted' } })
    expect(await app.isFriend('uA', 'uB')).toBe(true)
    // respond(accept) 通知发起方 uB（handshake），并对双方 publish
    expect(pushes.some((p) => p.userId === 'uB' && p.n.icon === 'ph-handshake')).toBe(true)
    expect(published).toContain('uB')
    expect(published).toContain('uA')
  })
})

describe('SocialApp — idempotency & already', () => {
  it('duplicate outgoing → pending (idempotent, no second row/notify)', async () => {
    await app.requestById(actor('uA'), 'uB')
    pushes = []
    const r = await app.requestById(actor('uA'), 'uB')
    expect(r).toMatchObject({ pending: true })
    expect(pushes).toHaveLength(0)
  })
  it('already friends → already', async () => {
    await app.requestById(actor('uB'), 'uA')
    await app.requestById(actor('uA'), 'uB') // auto-accept
    const r = await app.requestById(actor('uA'), 'uB')
    expect(r).toMatchObject({ already: true })
  })
})

describe('SocialApp — declined re-request', () => {
  it('after decline, requesting again reopens pending in current direction', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    await app.respond(actor('uB'), fid, false) // 拒绝
    expect(await app.isFriend('uA', 'uB')).toBe(false)
    pushes = []
    const again = await app.requestById(actor('uA'), 'uB')
    expect(again).toMatchObject({ friendship: { id: fid, status: 'pending' } })
    expect(pushes).toHaveLength(1) // 重新发起会再次通知
    expect((await app.overview('uB')).incoming).toHaveLength(1)
  })
})

describe('SocialApp — respond', () => {
  it('accept: sets accepted, notifies requester, marks my notif handled, publishes both', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    pushes = []; published = []
    const r = await app.respond(actor('uB'), fid, true)
    expect(r).toMatchObject({ friendship: { id: fid, status: 'accepted' }, requesterId: 'uA' })
    expect(pushes).toEqual([
      expect.objectContaining({ userId: 'uA', n: expect.objectContaining({ icon: 'ph-handshake' }) }),
    ])
    expect(handledFor).toEqual([{ ref: fid, userId: 'uB' }])
    expect(published).toContain('uA')
    expect(published).toContain('uB')
  })

  it('decline: silent to requester, still marks handled + publishes self', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    pushes = []; published = []
    const r = await app.respond(actor('uB'), fid, false)
    expect(r).toMatchObject({ friendship: { status: 'declined' } })
    expect(pushes).toHaveLength(0) // 不通知发起方
    expect(handledFor).toEqual([{ ref: fid, userId: 'uB' }])
    expect(published).toEqual(['uB'])
  })

  it('non-addressee or non-pending → null', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    expect(await app.respond(actor('uA'), fid, true)).toBeNull() // 发起方不能自批
    expect(await app.respond(actor('uC'), fid, true)).toBeNull() // 无关方
    await app.respond(actor('uB'), fid, true)
    expect(await app.respond(actor('uB'), fid, true)).toBeNull() // 已非 pending
  })
})

describe('SocialApp — remove', () => {
  it('requester cancels a pending request', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    const r = await app.remove(actor('uA'), fid)
    expect(r).toMatchObject({ removed: true, otherId: 'uB', wasPending: true })
    expect(handled).toEqual([fid])
    expect(await app.isFriend('uA', 'uB')).toBe(false)
  })

  it('addressee cannot cancel a pending request (must decline) → null', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    expect(await app.remove(actor('uB'), fid)).toBeNull()
  })

  it('non-party → null', async () => {
    const req = await app.requestById(actor('uA'), 'uB')
    const fid = (req as { friendship: { id: string } }).friendship.id
    expect(await app.remove(actor('uC'), fid)).toBeNull()
  })

  it('either party can remove an accepted friendship', async () => {
    await app.requestById(actor('uB'), 'uA')
    const r = await app.requestById(actor('uA'), 'uB') // accepted
    const fid = (r as { friendship: { id: string } }).friendship.id
    const removed = await app.remove(actor('uB'), fid)
    expect(removed).toMatchObject({ removed: true, otherId: 'uA', wasPending: false })
  })
})

describe('SocialApp — overview / isFriend / friendIds', () => {
  it('categorizes accepted / incoming / outgoing; declined hidden', async () => {
    // uA<->uB accepted
    await app.requestById(actor('uB'), 'uA')
    await app.requestById(actor('uA'), 'uB')
    // uC -> uA incoming (for uA)
    await app.requestById(actor('uC'), 'uA')
    // uA -> uD outgoing
    await app.requestById(actor('uA'), 'uD')
    // uA -> ... declined by someone: make uA request then decline via uB? use fresh pair uA<->? already used. Use uD? it's outgoing.
    const ov = await app.overview('uA')
    expect(ov.friends.map((f) => f.id)).toEqual(['uB'])
    expect(ov.incoming.map((f) => f.id)).toEqual(['uC'])
    expect(ov.outgoing.map((f) => f.id)).toEqual(['uD'])
  })

  it('isFriend: self true, accepted true, none false; friendIds lists accepted counterparts', async () => {
    expect(await app.isFriend('uA', 'uA')).toBe(true)
    expect(await app.isFriend('uA', 'uB')).toBe(false)
    await app.requestById(actor('uB'), 'uA')
    await app.requestById(actor('uA'), 'uB')
    expect(await app.isFriend('uA', 'uB')).toBe(true)
    expect(await app.friendIds('uA')).toEqual(['uB'])
    expect(await app.friendIds('uC')).toEqual([])
  })
})
