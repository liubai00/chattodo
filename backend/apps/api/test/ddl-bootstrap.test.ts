import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { ALL_DDL, bootstrapSchema } from '../src/composition/ddl-bootstrap.js'

let client: PGlite

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
})
afterEach(async () => {
  await client.close()
})

const db = () => ({
  async execute<R>(text: string, params?: readonly unknown[]) {
    const res = await client.query(text, params ? [...params] : undefined)
    return res.rows as R[]
  },
})

describe('ddl-bootstrap（本地 PGlite 模式 / 全新环境初始化）', () => {
  it('空库一次 bootstrap 建齐全部表（覆盖 69 路由所需的每张表）', async () => {
    await bootstrapSchema(db())
    const rows = await db().execute<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const tables = new Set(rows.map((r) => r.table_name))
    // 路由/组合根实际 touch 的表清单（漏一张 = 某条路由 500）
    for (const t of [
      'users',
      'sessions',
      'app_settings',
      'agent_profile',
      'tasks',
      'todo_ideas',
      'non_todo_outputs',
      'capture_records',
      'corrections',
      'task_collaborators',
      'subtasks',
      'comments',
      'activity',
      'projects',
      'friendships',
      'auto_rules',
      'notifications',
      'conversations',
      'chat_messages',
      'ai_config',
      'ai_errors',
    ]) {
      expect(tables.has(t), `缺表: ${t}`).toBe(true)
    }
  })

  it('bootstrap 幂等：重复应用不报错、不重建', async () => {
    await bootstrapSchema(db())
    await bootstrapSchema(db()) // 第二次必须安静通过（全部 IF NOT EXISTS）
    expect(ALL_DDL.length).toBeGreaterThan(20)
  })
})
