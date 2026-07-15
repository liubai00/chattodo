import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  TASKS_DDL,
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeCorrectionRepo,
  type Queryable,
} from '../src/index.js'

let client: PGlite
let db: Queryable

// 递增分钟时钟：控制 created_at（现网 nowIso 为分精度）以确定排序
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
  for (const stmt of TASKS_DDL) await client.exec(stmt)
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

function taskRepo(userId = 'uA') {
  return makeTaskRepo({ db, userId, clock: steppingClock(), genId: seqId })
}

describe('TaskRepo (PGlite)', () => {
  it('create applies faithful defaults (assignee null, priority 3, work, empty tags)', async () => {
    const repo = taskRepo()
    const t = await repo.create({ title: '写周报' })
    expect(t).toMatchObject({
      title: '写周报',
      notes: '',
      status: 'todo',
      priority: 3,
      privacyScope: 'work',
      tags: [],
      assignee: null,
      durationMinutes: null,
      projectId: null,
      sourceIdeaId: null,
    })
    expect(t.id).toBe('task_test1')
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/)
  })

  it('roundtrips tags + nullable fields', async () => {
    const repo = taskRepo()
    const t = await repo.create({
      title: 'x',
      tags: ['a', 'b'],
      dueAt: '2026-07-20T10:00:00',
      durationMinutes: 45,
      priority: 1,
      privacyScope: 'personal',
      projectId: 'proj_1',
    })
    const got = await repo.get(t.id)
    expect(got?.tags).toEqual(['a', 'b'])
    expect(got?.dueAt).toBe('2026-07-20T10:00:00')
    expect(got?.durationMinutes).toBe(45)
    expect(got?.priority).toBe(1)
    expect(got?.privacyScope).toBe('personal')
    expect(got?.projectId).toBe('proj_1')
  })

  it('all() returns own tasks in created_at DESC', async () => {
    const repo = taskRepo()
    const a = await repo.create({ title: 'first' })
    const b = await repo.create({ title: 'second' })
    const c = await repo.create({ title: 'third' })
    const all = await repo.all()
    expect(all.map((t) => t.id)).toEqual([c.id, b.id, a.id])
  })

  it('owner update patches present fields + touches updated_at', async () => {
    const repo = taskRepo()
    const t = await repo.create({ title: 'orig' })
    const updated = await repo.update(t.id, { title: 'new', priority: 1, tags: ['z'] })
    expect(updated?.title).toBe('new')
    expect(updated?.priority).toBe(1)
    expect(updated?.tags).toEqual(['z'])
    expect(updated?.updatedAt >= t.updatedAt).toBe(true)
  })

  it('collaborator can update only status; access reflects roles; all() unions accepted collab tasks', async () => {
    // uB 拥有的任务 + uA 已接受协作
    await db.execute(
      `INSERT INTO tasks (id,user_id,title,tags,created_at,updated_at) VALUES ($1,$2,$3,'[]','2026-07-15T08:00:00','2026-07-15T08:00:00')`,
      ['task_shared', 'uB', 'shared task'],
    )
    await db.execute(
      `INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at) VALUES ('clb1','task_shared','uB','uA','uB','accepted',1,'2026-07-15T08:00:00')`,
    )
    const repo = taskRepo('uA')
    expect(await repo.access('task_shared')).toBe('collaborator')

    const own = await repo.create({ title: 'my own' })
    expect(await repo.access(own.id)).toBe('owner')

    const all = await repo.all()
    expect(all.map((t) => t.id).sort()).toEqual(['task_shared', own.id].sort())

    // 协作者改 status 生效，改 title 被忽略
    const res = await repo.update('task_shared', { status: 'done', title: 'HACKED' })
    expect(res?.status).toBe('done')
    expect(res?.title).toBe('shared task')
  })

  it('access null + get undefined for a stranger task', async () => {
    await db.execute(
      `INSERT INTO tasks (id,user_id,title,tags,created_at,updated_at) VALUES ('task_x','uZ','secret','[]','2026-07-15T08:00:00','2026-07-15T08:00:00')`,
    )
    const repo = taskRepo('uA')
    expect(await repo.access('task_x')).toBeNull()
    expect(await repo.get('task_x')).toBeUndefined()
  })

  it('remove is owner-scoped', async () => {
    const repo = taskRepo()
    const t = await repo.create({ title: 'gone' })
    await repo.remove(t.id)
    expect(await repo.get(t.id)).toBeUndefined()
  })
})

describe('IdeaRepo + NonTodoRepo (PGlite)', () => {
  it('idea create/list/update (rawText not updatable)/remove', async () => {
    const repo = makeIdeaRepo({ db, userId: 'uA', clock: steppingClock(), genId: seqId })
    const i = await repo.create({ title: '研究 Cubox', rawText: '周末看看' })
    expect(i.status).toBe('clarifying')
    expect(i.rawText).toBe('周末看看')
    const upd = await repo.update(i.id, { status: 'archived', title: 'renamed' })
    expect(upd?.status).toBe('archived')
    expect(upd?.title).toBe('renamed')
    expect(upd?.rawText).toBe('周末看看') // rawText 不可改
    await repo.remove(i.id)
    expect(await repo.get(i.id)).toBeUndefined()
  })

  it('non-todo create/list/remove with corrected flag', async () => {
    const repo = makeNonTodoRepo({ db, userId: 'uA', clock: steppingClock(), genId: seqId })
    const n = await repo.create({ title: '稍后读', corrected: true, suggestedDestination: 'copy' })
    expect(n.corrected).toBe(true)
    expect(n.suggestedDestination).toBe('copy')
    const list = await repo.all()
    expect(list.map((x) => x.id)).toContain(n.id)
    await repo.remove(n.id)
    expect(await repo.get(n.id)).toBeUndefined()
  })
})

describe('CaptureRecordRepo + CorrectionRepo (move-out support)', () => {
  it('getByEntity + relink repoints the generation record', async () => {
    const caps = makeCaptureRecordRepo({ db, userId: 'uA', clock: steppingClock(), genId: seqId })
    const rec = await caps.create({
      rawInput: '下周三前交周报',
      aiKind: 'task',
      resultEntityType: 'task',
      resultEntityId: 'task_1',
      aiReason: '含明确截止',
    })
    expect(await caps.getByEntity('task', 'task_1')).toMatchObject({ id: rec.id, rawInput: '下周三前交周报' })

    await caps.relink('task_1', 'non_todo', 'non_9')
    expect(await caps.getByEntity('task', 'task_1')).toBeUndefined()
    expect(await caps.getByEntity('non_todo', 'non_9')).toMatchObject({ id: rec.id })
  })

  it('correction create returns an id and persists a row', async () => {
    const corr = makeCorrectionRepo({ db, userId: 'uA', clock: steppingClock(), genId: seqId })
    const id = await corr.create({
      entityType: 'non_todo',
      entityId: 'non_9',
      fromKind: 'task',
      toKind: 'non_todo',
      note: '移出 todo（误分类纠错）',
    })
    const [row] = await db.execute<{ c: number }>(
      'SELECT count(*)::int AS c FROM corrections WHERE id = $1',
      [id],
    )
    expect(row?.c).toBe(1)
  })
})
