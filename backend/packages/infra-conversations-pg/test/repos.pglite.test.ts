import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  CONVERSATIONS_DDL,
  makeConversationRepo,
  makeChatReadRepo,
  type Queryable,
} from '../src/index.js'

let client: PGlite
let db: Queryable

function steppingClock(startIso = '2026-07-15T09:00:00') {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 1000) // 秒级步进（nowIsoMs 精度）
}
let idc = 0
const seqId = (p: string): string => `${p}_t${++idc}`

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const s of CONVERSATIONS_DDL) await client.exec(s)
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

const repo = (userId = 'uA') => makeConversationRepo({ db, userId, clock: steppingClock(), genId: seqId })

async function seedMsg(convId: string, userId: string, role: string, text: string, at: string): Promise<void> {
  await db.execute(
    `INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ($1,$2,$3,$4,$5,0,$6)`,
    [`msg_${text}`, userId, convId, role, text, at],
  )
}

describe('ConversationRepo', () => {
  it('ensureDefault creates conv_<user> once; latestId returns it', async () => {
    const r = repo('uA')
    const id = await r.ensureDefault()
    expect(id).toBe('conv_uA')
    await r.ensureDefault() // idempotent
    const list = await r.list()
    expect(list).toHaveLength(1)
    expect(await r.latestId()).toBe('conv_uA')
  })

  it('create + list includes lastText + messageCount', async () => {
    const r = repo('uA')
    const c = await r.create('研究方案')
    expect(c).toMatchObject({ title: '研究方案', lastText: '', messageCount: 0 })
    await seedMsg(c!.id, 'uA', 'user', '第一句', '2026-07-15T09:00:00')
    await seedMsg(c!.id, 'uA', 'agent', '回复啦', '2026-07-15T09:01:00')
    const list = await r.list()
    expect(list[0]).toMatchObject({ id: c!.id, lastText: '回复啦', messageCount: 2 })
  })

  it('title capped at 40 chars; default when empty', async () => {
    const r = repo('uA')
    const c = await r.create('x'.repeat(60))
    expect(c!.title).toHaveLength(40)
    const d = await r.create('')
    expect(d!.title).toBe('新对话')
  })

  it('rename updates title (returns undefined for unknown/other-user)', async () => {
    const r = repo('uA')
    const c = await r.create('旧名')
    const renamed = await r.rename(c!.id, '新名')
    expect(renamed?.title).toBe('新名')
    expect(await r.rename('nope', 'x')).toBeUndefined()
    // other user cannot rename
    expect(await makeConversationRepo({ db, userId: 'uB', clock: steppingClock(), genId: seqId }).rename(c!.id, 'hack')).toBeUndefined()
  })

  it('touch auto-names only default placeholders; else just bumps', async () => {
    const r = repo('uA')
    await r.ensureDefault() // title 默认对话
    await r.touch('conv_uA', '帮我规划下周的任务安排啊啊啊啊啊')
    expect((await r.get('conv_uA'))?.title).toBe('帮我规划下周的任务安排啊啊啊啊啊'.slice(0, 24))
    // 已有非默认标题 → touch 不改名
    await r.touch('conv_uA', '另一个标题')
    expect((await r.get('conv_uA'))?.title).toBe('帮我规划下周的任务安排啊啊啊啊啊'.slice(0, 24))
  })

  it('remove deletes conversation and its messages', async () => {
    const r = repo('uA')
    const c = await r.create('待删')
    await seedMsg(c!.id, 'uA', 'user', '内容', '2026-07-15T09:00:00')
    await r.remove(c!.id)
    expect(await r.get(c!.id)).toBeUndefined()
    const msgs = await db.execute(`SELECT * FROM chat_messages WHERE conversation_id = $1`, [c!.id])
    expect(msgs).toHaveLength(0)
  })

  it('list/get are per-user isolated', async () => {
    await repo('uA').create('A 的')
    expect(await repo('uB').list()).toHaveLength(0)
  })
})

describe('ChatReadRepo', () => {
  it('all(convId) returns messages ASC; per-user scoped', async () => {
    const r = repo('uA')
    const c = await r.create('对话')
    await seedMsg(c!.id, 'uA', 'user', 'b', '2026-07-15T09:02:00')
    await seedMsg(c!.id, 'uA', 'agent', 'a', '2026-07-15T09:01:00')
    await seedMsg(c!.id, 'uB', 'user', 'other', '2026-07-15T09:03:00') // 他人
    const read = makeChatReadRepo({ db, userId: 'uA' })
    const msgs = await read.all(c!.id)
    expect(msgs.map((m) => m.text)).toEqual(['a', 'b']) // created_at ASC
    expect(msgs.every((m) => m.conversationId === c!.id)).toBe(true)
  })
})
