import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Queryable } from '@linx/infra-tasks-pg'
import type { MigratedPlugin } from '../facade/build-api.js'
import {
  createTaskRepoFactory,
  type TaskRepoFactory,
} from '../composition/task-repo-factory.js'

export interface AdminPluginDeps {
  db: Queryable
  taskRepos?: TaskRepoFactory
}

/**
 * Admin BC 已迁移路由（组 'admin'）：只读内部后台，仅 admin 角色（member → 403）。
 *   GET /api/admin/overview     — 全用户 + 实体/错误计数
 *   GET /api/admin/users/:id    — 单用户生成记录（≤50）+ AI 错误（≤50）
 * 纯跨表只读报表，无单一 BC 归属 → 组合根原始 SQL（表名白名单，无注入面）。
 */
export function makeAdminPlugin(deps: AdminPluginDeps): MigratedPlugin {
  const { db } = deps
  const taskRepos = deps.taskRepos ?? createTaskRepoFactory({ db })

  const requireAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (!req.user || req.user.role !== 'admin') {
      void reply.status(403).send({ error: '仅管理员可访问内部后台' })
      return false
    }
    return true
  }

  const countMap = async (sql: string): Promise<Map<string, number>> => {
    const rows = await db.execute<{ user_id: string; c: number | string }>(sql)
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.user_id, Number(r.c))
    return m
  }

  return {
    group: 'admin',
    register: async (app) => {
      app.get('/api/admin/overview', async (req, reply) => {
        if (!requireAdmin(req, reply)) return
        const [users, legacyTasks, ideas, nons, errs, totalErrors] = await Promise.all([
          db.execute<{
            id: string
            name: string | null
            account_name: string | null
            email: string | null
            role: string | null
            created_at: string | null
          }>('SELECT id, name, account_name, email, role, created_at FROM users ORDER BY created_at'),
          taskRepos.backend === 'legacy'
            ? countMap('SELECT user_id, COUNT(*) c FROM tasks GROUP BY user_id')
            : Promise.resolve(new Map<string, number>()),
          countMap(`SELECT user_id, COUNT(*) c FROM todo_ideas WHERE status = 'clarifying' GROUP BY user_id`),
          countMap('SELECT user_id, COUNT(*) c FROM non_todo_outputs GROUP BY user_id'),
          countMap('SELECT user_id, COUNT(*) c FROM ai_errors GROUP BY user_id'),
          db.execute<{ c: number | string }>('SELECT COUNT(*) c FROM ai_errors'),
        ])
        const tasks = taskRepos.backend === 'legacy'
          ? legacyTasks
          : new Map(
              await Promise.all(
                users.map(async (user) => {
                  const rows = await taskRepos.forRequest({
                    actor: {
                      id: user.id,
                      name: user.name ?? '',
                      email: user.email ?? '',
                      role: user.role ?? 'member',
                    },
                  }).all()
                  return [user.id, rows.length] as const
                }),
              ),
            )
        return {
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            accountName: u.account_name || u.name,
            email: u.email,
            role: u.role,
            createdAt: u.created_at,
            taskCount: tasks.get(u.id) || 0,
            ideaCount: ideas.get(u.id) || 0,
            nonCount: nons.get(u.id) || 0,
            errorCount: errs.get(u.id) || 0,
          })),
          totalErrors: Number(totalErrors[0]?.c ?? 0),
        }
      })

      app.get('/api/admin/users/:id', async (req, reply) => {
        if (!requireAdmin(req, reply)) return
        const uid = (req.params as { id: string }).id
        const user = (
          await db.execute<{
            id: string
            name: string | null
            account_name: string | null
            email: string | null
            role: string | null
            created_at: string | null
          }>('SELECT id, name, account_name, email, role, created_at FROM users WHERE id = $1', [uid])
        )[0]
        if (!user) return reply.status(404).send({ error: 'user not found' })

        const recRows = await db.execute<Record<string, unknown>>(
          'SELECT * FROM capture_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
          [uid],
        )
        const errRows = await db.execute<{ id: string; raw_input: string | null; message: string | null; created_at: string | null }>(
          'SELECT * FROM ai_errors WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
          [uid],
        )

        const titleOf = async (type: unknown, id: unknown): Promise<string> => {
          if (!type || !id) return ''
          if (type === 'task' && taskRepos.backend === 'baserow') {
            const task = await taskRepos.forRequest({
              actor: {
                id: user.id,
                name: user.name ?? '',
                email: user.email ?? '',
                role: user.role ?? 'member',
              },
            }).get(String(id))
            return task?.title ?? '（已删除）'
          }
          const table = type === 'task' ? 'tasks' : type === 'todo_idea' ? 'todo_ideas' : 'non_todo_outputs'
          const row = (await db.execute<{ title: string }>(`SELECT title FROM ${table} WHERE id = $1`, [id]))[0]
          return row ? row.title : '（已删除）'
        }

        const records: Record<string, unknown>[] = []
        for (const r of recRows) {
          records.push({
            id: r.id,
            rawInput: r.raw_input,
            aiKind: r.ai_kind,
            aiReason: r.ai_reason,
            resultEntityType: r.result_entity_type,
            resultEntityId: r.result_entity_id,
            status: r.status,
            createdAt: r.created_at,
            resultTitle: await titleOf(r.result_entity_type, r.result_entity_id),
          })
        }
        return {
          user: {
            id: user.id,
            name: user.name,
            accountName: user.account_name || user.name,
            email: user.email,
            role: user.role,
            createdAt: user.created_at,
          },
          records,
          errors: errRows.map((e) => ({ id: e.id, rawInput: e.raw_input, message: e.message, createdAt: e.created_at })),
        }
      })
    },
  }
}
