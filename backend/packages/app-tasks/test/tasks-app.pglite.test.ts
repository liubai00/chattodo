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
} from '@linx/infra-tasks-pg'
import type { PrivacySettings } from '@linx/domain-tasks'
import { makeTasksApp, type TasksApp } from '../src/index.js'

let client: PGlite
let idCounter = 0

function steppingClock(startIso = '2026-07-15T09:00:00'): () => Date {
  const base = new Date(startIso)
  let step = 0
  return () => new Date(base.getTime() + step++ * 60_000)
}

async function wireApp(
  userId = 'uA',
  settings: PrivacySettings = { privacyMode: false, workspaceMode: 'work' },
): Promise<TasksApp> {
  const db: Queryable = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  const genId = (prefix: string): string => `${prefix}_c${++idCounter}`
  const repoDeps = { db, userId, clock: steppingClock(), genId }
  return makeTasksApp({
    tasks: makeTaskRepo(repoDeps),
    ideas: makeIdeaRepo(repoDeps),
    nonTodos: makeNonTodoRepo(repoDeps),
    captureRecords: makeCaptureRecordRepo(repoDeps),
    corrections: makeCorrectionRepo(repoDeps),
    getPrivacySettings: async () => settings,
    now: () => new Date('2026-07-15T12:00:00').getTime(),
  })
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const stmt of TASKS_DDL) await client.exec(stmt)
  idCounter = 0
})
afterEach(async () => {
  await client.close()
})

describe('TasksApp · task lifecycle', () => {
  it('create → list → get(+generationRecord) → done → reopen', async () => {
    const app = await wireApp()
    const t = await app.createTask({ title: '写周报' })
    expect((await app.listTasks({})).map((x) => x.id)).toContain(t.id)

    const detail = await app.getTask(t.id)
    expect(detail?.task.id).toBe(t.id)
    expect(detail?.generationRecord).toBeNull()

    expect((await app.completeTask(t.id))?.status).toBe('done')
    expect((await app.reopenTask(t.id))?.status).toBe('todo')
  })

  it('getTask includes the linked capture record', async () => {
    const app = await wireApp()
    const t = await app.createTask({ title: 'x' })
    // 直插一条生成记录指向该 task
    await client.query(
      `INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,ai_reason,result_entity_type,result_entity_id,status,created_at)
       VALUES ('rec1','uA','下周三前交周报','chat','task','含明确截止','task',$1,'ok','2026-07-15T09:00:00')`,
      [t.id],
    )
    const detail = await app.getTask(t.id)
    expect(detail?.generationRecord?.rawInput).toBe('下周三前交周报')
  })

  it('listTasks honors privacy visibility + filter', async () => {
    const app = await wireApp('uA', { privacyMode: true, workspaceMode: 'work' })
    await app.createTask({ title: 'work-open', privacyScope: 'work', status: 'todo' })
    await app.createTask({ title: 'personal-hidden', privacyScope: 'personal', status: 'todo' })
    await app.createTask({ title: 'mixed-visible', privacyScope: 'mixed', status: 'done' })
    const open = await app.listTasks({ view: 'open' })
    expect(open.map((t) => t.title)).toEqual(['work-open']) // personal hidden by privacy; mixed excluded by view=open
  })
})

describe('TasksApp · move-out (误分类纠错)', () => {
  it('creates a corrected non-todo, relinks the record, logs a correction, removes the task', async () => {
    const app = await wireApp()
    const t = await app.createTask({ title: '其实是参考资料', notes: '备注', privacyScope: 'personal' })
    await client.query(
      `INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,ai_reason,result_entity_type,result_entity_id,status,created_at)
       VALUES ('rec1','uA','可以借鉴 Cubox','chat','task','REASON','task',$1,'ok','2026-07-15T09:00:00')`,
      [t.id],
    )
    const non = await app.moveOutTask(t.id)
    expect(non).toMatchObject({
      title: '其实是参考资料',
      summary: '备注',
      rawText: '可以借鉴 Cubox',
      reason: 'REASON',
      source: 'correction',
      corrected: true,
      privacyScope: 'personal',
    })
    // 任务已删除
    expect(await app.getTask(t.id)).toBeUndefined()
    // 生成记录已改指向 non
    const recRes = await client.query<{ result_entity_type: string; result_entity_id: string }>(
      `SELECT result_entity_type, result_entity_id FROM capture_records WHERE id = 'rec1'`,
    )
    expect(recRes.rows[0]).toEqual({ result_entity_type: 'non_todo', result_entity_id: non!.id })
    // 纠错留痕
    const cRes = await client.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM corrections WHERE entity_id = $1`,
      [non!.id],
    )
    expect(cRes.rows[0]?.c).toBe(1)
    // non 出现在列表
    expect((await app.listNonTodos()).map((n) => n.id)).toContain(non!.id)
  })

  it('moveOut returns null for a missing task', async () => {
    const app = await wireApp()
    expect(await app.moveOutTask('nope')).toBeNull()
  })
})

describe('TasksApp · idea + non conversions', () => {
  async function seedIdea(id: string, title: string, raw: string): Promise<void> {
    await client.query(
      `INSERT INTO todo_ideas (id,user_id,title,raw_text,status,privacy_scope,source,created_at,updated_at)
       VALUES ($1,'uA',$2,$3,'clarifying','work','chat','2026-07-15T09:00:00','2026-07-15T09:00:00')`,
      [id, title, raw],
    )
  }
  async function seedNon(id: string, title: string, raw: string): Promise<void> {
    await client.query(
      `INSERT INTO non_todo_outputs (id,user_id,title,raw_text,privacy_scope,source,corrected,created_at,updated_at)
       VALUES ($1,'uA',$2,$3,'work','chat',0,'2026-07-15T09:00:00','2026-07-15T09:00:00')`,
      [id, title, raw],
    )
  }

  it('convertIdea creates a task and flips idea → converted', async () => {
    const app = await wireApp()
    await seedIdea('idea1', '研究 Cubox', '周末看看')
    const res = await app.convertIdea('idea1')
    expect(res?.task.title).toBe('研究 Cubox')
    expect(res?.task.notes).toBe('周末看看')
    expect(res?.task.durationMinutes).toBe(30)
    expect(res?.task.sourceIdeaId).toBe('idea1')
    expect(res?.idea.status).toBe('converted')
  })

  it('archiveIdea + discardIdea (hard delete)', async () => {
    const app = await wireApp()
    await seedIdea('idea2', 'A', 'raw')
    expect((await app.archiveIdea('idea2'))?.status).toBe('archived')
    expect(await app.discardIdea('idea2')).toBe(true)
    expect((await app.listIdeas()).map((i) => i.id)).not.toContain('idea2')
    expect(await app.discardIdea('missing')).toBe(false)
  })

  it('convertNonToTask creates a task and hard-deletes the non-todo', async () => {
    const app = await wireApp()
    await seedNon('non1', '稍后读', 'body')
    const res = await app.convertNonToTask('non1')
    expect(res?.task.title).toBe('稍后读')
    expect(res?.task.durationMinutes).toBe(30)
    expect(res?.task.sourceIdeaId).toBeNull()
    expect((await app.listNonTodos()).map((n) => n.id)).not.toContain('non1')
  })
})
