import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  COLLAB_DDL,
  makeCollaboratorRepo,
  makeAutoRuleRepo,
  type Queryable,
} from '@linx/infra-collab-pg'
import {
  makeCollabApp,
  type CollabAppDeps,
  type TaskGateway,
  type CollabNotification,
  type Performed,
} from '../src/index.js'

let client: PGlite
let db: Queryable

// trackers
let pushes: Array<{ userId: string; n: CollabNotification }>
let handledRefs: string[]
let chats: Array<{ userId: string; text: string }>
let published: Array<{ userIds: string[]; payload: unknown }>
let friendReqCalls: Array<{ actor: string; target: string }>
let friendSet: Set<string>
let friendReqResult: () => { autoAccepted?: boolean; friendship?: unknown; pending?: boolean; error?: string }

const USERS: Record<string, string> = { uOwner: 'Owner', uBob: 'Bob', uCarol: 'Carol', uDan: 'Dan' }
const pairKey = (a: string, b: string): string => [a, b].sort().join('|')

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
  await client.exec(
    `CREATE TABLE tasks (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, due_at TEXT, privacy_scope TEXT DEFAULT 'work', assignee TEXT)`,
  )
  for (const stmt of COLLAB_DDL) await client.exec(stmt)
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  for (const [id, name] of Object.entries(USERS)) {
    await client.query(`INSERT INTO users (id,name) VALUES ($1,$2)`, [id, name])
  }
  await client.query(
    `INSERT INTO tasks (id,user_id,title,due_at,privacy_scope) VALUES ('t1','uOwner','写方案','2026-07-20T18:00:00','work'),('tP','uOwner','私人计划',NULL,'personal')`,
  )
  pushes = []
  handledRefs = []
  chats = []
  published = []
  friendReqCalls = []
  friendSet = new Set()
  friendReqResult = () => ({ pending: true, friendship: { id: 'fr_x' } })
  idc = 0
})
afterEach(async () => {
  await client.close()
})

function taskGateway(actingId: string): TaskGateway {
  return {
    async get(id) {
      const r = (
        await db.execute<{ id: string; title: string; due_at: string | null; privacy_scope: string; assignee: string | null }>(
          'SELECT * FROM tasks WHERE id = $1',
          [id],
        )
      )[0]
      return r ? { id: r.id, title: r.title, dueAt: r.due_at, privacyScope: r.privacy_scope, assignee: r.assignee } : undefined
    },
    async access(id) {
      const r = (await db.execute<{ user_id: string }>('SELECT user_id FROM tasks WHERE id = $1', [id]))[0]
      if (!r) return null
      if (r.user_id === actingId) return 'owner'
      const c = (
        await db.execute(
          `SELECT 1 FROM task_collaborators WHERE task_id = $1 AND user_id = $2 AND status = 'accepted'`,
          [id, actingId],
        )
      )[0]
      return c ? 'collaborator' : null
    },
    async update(id, patch) {
      if (patch.assignee !== undefined) {
        await db.execute('UPDATE tasks SET assignee = $1 WHERE id = $2', [patch.assignee, id])
      }
      return this.get(id)
    },
  }
}

function buildApp(actingId: string): ReturnType<typeof makeCollabApp> {
  const deps: CollabAppDeps = {
    collaborators: makeCollaboratorRepo({ db, userId: actingId, clock: steppingClock(), genId: seqId }),
    autoRules: makeAutoRuleRepo({ db, userId: actingId, clock: steppingClock(), genId: seqId }),
    activity: { async log(taskId, text) { void taskId; void text; return seqId('act') } },
    tasks: taskGateway(actingId),
    users: {
      async byId(id) { return USERS[id] ? { id, name: USERS[id]! } : undefined },
      async byName(name) {
        const e = Object.entries(USERS).find(([, n]) => n === name)
        return e ? { id: e[0], name: e[1] } : undefined
      },
    },
    friends: {
      async isFriend(a, b) { return a === b || friendSet.has(pairKey(a, b)) },
      async requestById(user, target) { friendReqCalls.push({ actor: user.id, target }); return friendReqResult() },
    },
    notifier: {
      async push(userId, n) { pushes.push({ userId, n }) },
      async markHandledByRef(ref) { handledRefs.push(ref) },
    },
    chat: { async inject(userId, text) { chats.push({ userId, text }) } },
    events: {
      publish() {},
      publishMany(userIds, payload) { published.push({ userIds: [...userIds], payload }) },
    },
  }
  return makeCollabApp(deps)
}

const actor = (id: string) => ({ id, name: USERS[id]! })
const addFriend = (a: string, b: string): void => void friendSet.add(pairKey(a, b))

describe('invite', () => {
  it('fresh invite → notify + chat + reused=false (friends only)', async () => {
    addFriend('uOwner', 'uBob')
    const r = await buildApp('uOwner').invite(actor('uOwner'), 't1', 'uBob')
    expect(r).toMatchObject({ reused: false, userName: 'Bob' })
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toMatchObject({ userId: 'uBob', n: { icon: 'ph-user-plus', actionType: 'invite' } })
    expect(pushes[0]!.n.text).toContain('邀请你协作「写方案」（截止 7/20 18:00）')
    expect(chats).toHaveLength(1)
    expect(chats[0]!.userId).toBe('uBob')
  })
  it('non-friend → notFriend error (no row/notify)', async () => {
    const r = await buildApp('uOwner').invite(actor('uOwner'), 't1', 'uBob')
    expect(r).toMatchObject({ notFriend: true, targetId: 'uBob', targetName: 'Bob' })
    expect(pushes).toHaveLength(0)
  })
  it('self → bad; non-owner task → error; missing member → error', async () => {
    addFriend('uOwner', 'uBob')
    expect(await buildApp('uOwner').invite(actor('uOwner'), 't1', 'uOwner')).toMatchObject({ bad: true })
    expect(await buildApp('uBob').invite(actor('uBob'), 't1', 'uOwner')).toMatchObject({ error: '任务不存在或无权邀请' })
    expect(await buildApp('uOwner').invite(actor('uOwner'), 't1', 'uGhost')).toMatchObject({ error: '成员不存在' })
  })
  it('personal task without force → needConfirm; with force → invites', async () => {
    addFriend('uOwner', 'uBob')
    expect(await buildApp('uOwner').invite(actor('uOwner'), 'tP', 'uBob')).toMatchObject({ needConfirm: true })
    const r = await buildApp('uOwner').invite(actor('uOwner'), 'tP', 'uBob', { force: true })
    expect(r).toMatchObject({ reused: false })
  })
  it('re-invite → reused=true (no second notify)', async () => {
    addFriend('uOwner', 'uBob')
    const app = buildApp('uOwner')
    await app.invite(actor('uOwner'), 't1', 'uBob')
    pushes = []; chats = []
    const again = await app.invite(actor('uOwner'), 't1', 'uBob')
    expect(again).toMatchObject({ reused: true })
    expect(pushes).toHaveLength(0)
    expect(chats).toHaveLength(0)
  })
})

describe('respondInvite', () => {
  async function pendingInvite(): Promise<string> {
    addFriend('uOwner', 'uBob')
    const r = await buildApp('uOwner').invite(actor('uOwner'), 't1', 'uBob')
    return (r as { collab: { id: string } }).collab.id
  }
  it('accept → accepted, notifies inviter (check-circle), marks handled, returns task w/ collabFrom', async () => {
    const id = await pendingInvite()
    pushes = []
    const res = await buildApp('uBob').respondInvite(actor('uBob'), id, 'accept', true)
    expect(res?.collab.status).toBe('accepted')
    expect(res?.task).toMatchObject({ collabFrom: 'Owner', collabRemind: true, title: '写方案' })
    expect(handledRefs).toContain(id)
    expect(pushes).toEqual([expect.objectContaining({ userId: 'uOwner', n: expect.objectContaining({ icon: 'ph-check-circle' }) })])
  })
  it('decline → declined, x-circle notify, task null', async () => {
    const id = await pendingInvite()
    pushes = []
    const res = await buildApp('uBob').respondInvite(actor('uBob'), id, false)
    expect(res?.collab.status).toBe('declined')
    expect(res?.task).toBeNull()
    expect(pushes[0]!.n).toMatchObject({ icon: 'ph-x-circle', color: 'var(--danger)' })
  })
  it('follow → following, eye notify, task null', async () => {
    const id = await pendingInvite()
    pushes = []
    const res = await buildApp('uBob').respondInvite(actor('uBob'), id, 'follow')
    expect(res?.collab.status).toBe('following')
    expect(res?.task).toBeNull()
    expect(pushes[0]!.n.icon).toBe('ph-eye')
  })
  it('invalid / already-handled invite → null', async () => {
    const id = await pendingInvite()
    expect(await buildApp('uOwner').respondInvite(actor('uOwner'), id, 'accept')).toBeNull() // 非 addressee
    await buildApp('uBob').respondInvite(actor('uBob'), id, 'accept')
    expect(await buildApp('uBob').respondInvite(actor('uBob'), id, 'decline')).toBeNull() // 已处理
  })
})

describe('notifyTaskDone', () => {
  it('notifies owner+accepted+following except actor; publishMany task event', async () => {
    addFriend('uOwner', 'uBob')
    addFriend('uOwner', 'uCarol')
    const owner = buildApp('uOwner')
    const bobInv = ((await owner.invite(actor('uOwner'), 't1', 'uBob')) as { collab: { id: string } }).collab.id
    const carolInv = ((await owner.invite(actor('uOwner'), 't1', 'uCarol')) as { collab: { id: string } }).collab.id
    await buildApp('uBob').respondInvite(actor('uBob'), bobInv, 'accept')
    await buildApp('uCarol').respondInvite(actor('uCarol'), carolInv, 'follow')
    pushes = []; published = []
    // uBob 完成任务 → 通知 owner + carol（不含 bob 自己）
    await buildApp('uBob').notifyTaskDone(actor('uBob'), 't1')
    const notified = pushes.map((p) => p.userId).sort()
    expect(notified).toEqual(['uCarol', 'uOwner'])
    expect(pushes.every((p) => p.n.type === 'done')).toBe(true)
    expect(published[0]?.payload).toMatchObject({ kind: 'task', taskId: 't1' })
    // publishMany 收的是已排除操作者的 watchers（承 legacy：filter 后再 publishMany）
    expect(published[0]?.userIds.sort()).toEqual(['uCarol', 'uOwner'])
  })
})

describe('auto rules', () => {
  it('maybeCreateAutoRule creates for a friend; blocks non-friend / unknown / dup', async () => {
    const owner = buildApp('uOwner')
    expect(await owner.maybeCreateAutoRule('以后合同类的任务都邀请Bob', actor('uOwner'))).toBeNull() // 非好友
    addFriend('uOwner', 'uBob')
    const rule = await owner.maybeCreateAutoRule('以后合同类的任务都邀请Bob', actor('uOwner'))
    expect(rule).toMatchObject({ keyword: '合同', targetId: 'uBob' })
    expect(await owner.maybeCreateAutoRule('以后合同类的任务都邀请Bob', actor('uOwner'))).toBeNull() // 重复
    expect(await owner.maybeCreateAutoRule('以后发票类的任务都邀请Nobody', actor('uOwner'))).toBeNull() // 未知成员
  })
  it('applyAutoInvites fires invite on keyword hit', async () => {
    addFriend('uOwner', 'uBob')
    const owner = buildApp('uOwner')
    await owner.maybeCreateAutoRule('以后合同类的任务都邀请Bob', actor('uOwner'))
    const performed = await owner.applyAutoInvites(actor('uOwner'), { id: 't1', title: '合同评审' }, '')
    expect(performed).toEqual([expect.objectContaining({ type: 'invite', auto: true, rule: '合同', userId: 'uBob' })])
  })
})

describe('extractMentionedUsers', () => {
  it('resolves @names + isFriend flags, skips self & unknown', async () => {
    addFriend('uOwner', 'uBob')
    const out = await buildApp('uOwner').extractMentionedUsers('@Bob @Carol @Owner @Ghost 看下', actor('uOwner'))
    expect(out).toEqual([
      { id: 'uBob', name: 'Bob', isFriend: true },
      { id: 'uCarol', name: 'Carol', isFriend: false },
    ])
  })
})

describe('settleMentionedCollab', () => {
  it('invites a friend, assigns responsible, and records friend-request for a non-friend', async () => {
    addFriend('uOwner', 'uBob') // Bob 是好友；Carol 不是
    const owner = buildApp('uOwner')
    const performed: Performed[] = []
    const taskEntity = { entity: { id: 't1', title: '写方案', assignee: null as string | null } }
    const { lines, names } = await owner.settleMentionedCollab({
      user: actor('uOwner'),
      message: '@Bob @Carol 一起搞',
      taskEntity,
      performed,
    })
    // Bob → 邀请 + 责任人；Carol → 好友请求
    expect(lines.some((l) => l.includes('已向 Bob 发出协作邀请') && l.includes('责任人'))).toBe(true)
    expect(lines.some((l) => l.includes('Carol') && l.includes('好友请求'))).toBe(true)
    expect(taskEntity.entity.assignee).toBe('Bob') // 第一个成功邀请者成为责任人
    expect(friendReqCalls).toEqual([{ actor: 'uOwner', target: 'uCarol' }])
    expect(performed.some((p) => p.type === 'invite' && p.userId === 'uBob')).toBe(true)
    expect(performed.some((p) => p.type === 'friend_request' && p.userId === 'uCarol')).toBe(true)
    expect(names).toEqual(expect.arrayContaining(['Bob', 'Carol']))
  })
  it('unknown @name → guidance line', async () => {
    const { lines } = await buildApp('uOwner').settleMentionedCollab({
      user: actor('uOwner'),
      message: '@Ghost 帮忙',
      taskEntity: { entity: { id: 't1', title: '写方案', assignee: null } },
      performed: [],
    })
    expect(lines.some((l) => l.includes('没找到成员「Ghost」'))).toBe(true)
  })
  it('auto-accepted friend request yields the "已成为好友" line', async () => {
    friendReqResult = () => ({ autoAccepted: true })
    const performed: Performed[] = []
    const { lines } = await buildApp('uOwner').settleMentionedCollab({
      user: actor('uOwner'),
      message: '@Carol 一起',
      taskEntity: { entity: { id: 't1', title: '写方案', assignee: null } },
      performed,
    })
    expect(lines.some((l) => l.includes('已成为好友'))).toBe(true)
    expect(performed.some((p) => p.type === 'friend_request' && p.auto)).toBe(true)
  })
})
