import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  TASKS_DDL,
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeActivityRepo,
  type Queryable,
} from '@linx/infra-tasks-pg'
import { PROJECTS_DDL, makeProjectRepo } from '@linx/infra-projects-pg'
import { makeProjectsApp } from '@linx/app-projects'
import { makeCaptureApp, type CaptureApp } from '../src/index.js'

const NOW = new Date('2026-07-15T09:00:00').getTime()
let client: PGlite
let n = 0

function wire(userId = 'uA'): CaptureApp {
  const db: Queryable = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const res = await client.query(text, params ? [...params] : undefined)
      return res.rows as R[]
    },
  }
  const genId = (p: string): string => `${p}_c${++n}`
  const repoDeps = { db, userId, genId }
  const projects = makeProjectsApp({ projects: makeProjectRepo(repoDeps) })
  return makeCaptureApp({
    tasks: makeTaskRepo(repoDeps),
    ideas: makeIdeaRepo(repoDeps),
    nonTodos: makeNonTodoRepo(repoDeps),
    captureRecords: makeCaptureRecordRepo(repoDeps),
    activity: makeActivityRepo(repoDeps),
    projectIdForText: (t) => projects.projectIdForText(t),
    now: () => NOW,
  })
}

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  for (const stmt of [...TASKS_DDL, ...PROJECTS_DDL]) await client.exec(stmt)
  n = 0
})
afterEach(async () => {
  await client.close()
})

async function count(table: string): Promise<number> {
  const res = await client.query<{ c: number }>(`SELECT count(*)::int AS c FROM ${table}`)
  return res.rows[0]?.c ?? 0
}

describe('CaptureApp (rule triage → persist)', () => {
  it('actionable+dated → task + capture record + activity + generation-record link', async () => {
    const app = wire()
    const out = await app.capture({ text: '下周三前提交 MVP 文档评审', source: 'web' })
    expect(out.entityType).toBe('task')
    expect(await count('tasks')).toBe(1)
    const rec = await client.query<{ ai_kind: string; result_entity_type: string }>(
      'SELECT ai_kind, result_entity_type FROM capture_records',
    )
    expect(rec.rows[0]).toMatchObject({ ai_kind: 'task', result_entity_type: 'task' })
    const act = await client.query<{ text: string }>('SELECT text FROM activity')
    expect(act.rows[0]?.text).toBe('任务已创建（来自聊天输入）')
  })

  it('vague research (no date) → todo_idea (rawText = original)', async () => {
    const app = wire()
    const out = await app.capture({ text: '研究一下 Cubox', source: 'chat' })
    expect(out.entityType).toBe('todo_idea')
    const idea = await client.query<{ raw_text: string; source: string }>(
      'SELECT raw_text, source FROM todo_ideas',
    )
    expect(idea.rows[0]).toMatchObject({ raw_text: '研究一下 Cubox', source: 'chat' })
    expect(await count('activity')).toBe(0) // non-task 无 activity
  })

  it('reference/idea → non_todo', async () => {
    const app = wire()
    const out = await app.capture({ text: '可以借鉴 Cubox 的稍后读' })
    expect(out.entityType).toBe('non_todo')
    expect(await count('non_todo_outputs')).toBe(1)
  })

  it('smart project assignment: task title matching a project name gets projectId', async () => {
    const app = wire()
    // 先建项目
    await client.query(
      `INSERT INTO projects (id,user_id,name,description,status,privacy_scope,created_at,updated_at)
       VALUES ('proj_mvp','uA','MVP 文档','','active','work','2026-07-15T08:00:00','2026-07-15T08:00:00')`,
    )
    await app.capture({ text: '明天提交 MVP 文档终稿' })
    const task = await client.query<{ project_id: string }>('SELECT project_id FROM tasks')
    expect(task.rows[0]?.project_id).toBe('proj_mvp')
  })
})
