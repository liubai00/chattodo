import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { NOTIFICATIONS_DDL, makeNotificationRepo, type Queryable } from '../src/index.js'

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
  for (const s of NOTIFICATIONS_DDL) await client.exec(s)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  idc = 0
})
afterEach(async () => {
  await client.close()
})

const repo = (userId = 'uA') => makeNotificationRepo({ db, userId, clock: steppingClock(), genId: seqId })

describe('NotificationRepo (PGlite)', () => {
  it('create applies faithful low-level defaults (type/icon/color null, read from input, handled 0)', async () => {
    const n = await repo().create({ text: '你有一条新消息' })
    expect(n).toMatchObject({
      text: '你有一条新消息',
      type: null,
      icon: null,
      color: null,
      read: false,
      handled: false,
      actionType: null,
      actionRef: null,
    })
    expect(n.id).toBe('nt_t1')
    expect(n.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/)
  })

  it('honors explicit read + fields', async () => {
    const n = await repo().create({ text: 'x', read: true, type: 'friend', icon: 'ph-handshake', color: 'var(--accent)', actionType: 'friend_request', actionRef: 'fr_1' })
    expect(n).toMatchObject({ read: true, type: 'friend', actionType: 'friend_request', actionRef: 'fr_1' })
  })

  it('all() is per-user, created_at DESC (+id tiebreak)', async () => {
    const a = repo('uA')
    await a.create({ text: 'first' })
    await a.create({ text: 'second' })
    await makeNotificationRepo({ db, userId: 'uB', clock: steppingClock(), genId: seqId }).create({ text: 'other' })
    const list = await a.all()
    expect(list.map((n) => n.text)).toEqual(['second', 'first']) // DESC
    expect(list).toHaveLength(2) // uB's excluded
  })

  it('markAllRead / markRead scoped to user', async () => {
    const a = repo('uA')
    const n1 = await a.create({ text: 'one' })
    await a.create({ text: 'two' })
    await a.markRead(n1.id)
    let list = await a.all()
    expect(list.find((n) => n.id === n1.id)?.read).toBe(true)
    expect(list.find((n) => n.text === 'two')?.read).toBe(false)
    await a.markAllRead()
    list = await a.all()
    expect(list.every((n) => n.read)).toBe(true)
  })

  it('markHandledByRef sets handled+read for the user’s matching action_ref only', async () => {
    const a = repo('uA')
    const b = makeNotificationRepo({ db, userId: 'uB', clock: steppingClock(), genId: seqId })
    await a.create({ text: 'invite', actionRef: 'clb_9' })
    await b.create({ text: 'invite', actionRef: 'clb_9' })
    await a.markHandledByRef('clb_9')
    expect((await a.all())[0]).toMatchObject({ handled: true, read: true })
    expect((await b.all())[0]).toMatchObject({ handled: false, read: false }) // uB 不受影响
  })

  it('existsToday matches same text on the same day only', async () => {
    const today = makeNotificationRepo({ db, userId: 'uA', clock: () => new Date('2026-07-15T09:00:00'), genId: seqId })
    await today.create({ text: '任务今天到期', createdAt: '2026-07-15T08:00:00' })
    expect(await today.existsToday('任务今天到期')).toBe(true)
    expect(await today.existsToday('别的文案')).toBe(false)
    const otherDay = makeNotificationRepo({ db, userId: 'uA', clock: () => new Date('2026-07-16T09:00:00'), genId: seqId })
    expect(await otherDay.existsToday('任务今天到期')).toBe(false) // 昨天的不算
  })
})
