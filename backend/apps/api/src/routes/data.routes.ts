import type { FastifyReply, FastifyRequest } from 'fastify'
import { makePrefixedId } from '@linx/kernel-ids'
import { makeIdeaRepo, makeNonTodoRepo, type Queryable } from '@linx/infra-tasks-pg'
import { makeProjectRepo } from '@linx/infra-projects-pg'
import { makeSettingsRepo, makeAgentRepo } from '@linx/infra-settings-pg'
import type { MigratedPlugin } from '../facade/build-api.js'
import { actorFromUser, createTaskRepoFactory, type TaskRepoFactory } from '../composition/task-repo-factory.js'

export interface DataPluginDeps {
  db: Queryable
  taskRepos?: TaskRepoFactory
  clock?: () => Date
  genId?: (prefix: string) => string
}

/**
 * Data BC 已迁移路由（组 'data'）：数据主权 —— 导出 / 清空当前账户的业务数据。
 *   GET  /api/export      — 当前用户全部数据的 JSON dump
 *   POST /api/data/clear  — 清空业务数据（保留账号/会话骨架/设置/agent/AI 配置）
 */
export function makeDataPlugin(deps: DataPluginDeps): MigratedPlugin {
  const { db } = deps
  const taskRepos = deps.taskRepos ?? createTaskRepoFactory({ db })
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((p: string): string => makePrefixedId(p)())

  const uid = (req: FastifyRequest, reply: FastifyReply): string | undefined => {
    const id = req.user?.id
    if (!id) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return id
  }

  return {
    group: 'data',
    register: async (app) => {
      app.get('/api/export', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const opt = { db, userId, clock, genId }
        const [projects, tasks, todoIdeas, nonTodoOutputs, agentProfile, appSettings, captureRecords, corrections, chat, friendships] =
          await Promise.all([
            taskRepos.backend === 'baserow' ? Promise.resolve([]) : makeProjectRepo({ db, userId }).all(),
            taskRepos.forRequest({ actor: actorFromUser(req.user!), clock, genId }).all(),
            makeIdeaRepo(opt).all(),
            makeNonTodoRepo(opt).all(),
            makeAgentRepo({ db, userId, clock }).get(),
            makeSettingsRepo({ db, userId, clock }).get(),
            db.execute('SELECT * FROM capture_records WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
            db.execute('SELECT * FROM corrections WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
            db.execute('SELECT * FROM chat_messages WHERE user_id = $1 ORDER BY created_at', [userId]),
            db.execute<{ id: string; requester_id: string; addressee_id: string; status: string; created_at: string; responded_at: string | null }>(
              'SELECT * FROM friendships WHERE requester_id = $1 OR addressee_id = $2',
              [userId, userId],
            ),
          ])
        return {
          exportedAt: clock().toISOString(),
          user: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : null,
          projects,
          tasks,
          todoIdeas,
          nonTodoOutputs,
          captureRecords,
          corrections,
          chat,
          agentProfile,
          appSettings,
          friendships: friendships.map((f) => ({ id: f.id, requesterId: f.requester_id, addresseeId: f.addressee_id, status: f.status, createdAt: f.created_at, respondedAt: f.responded_at })),
        }
      })

      app.post('/api/data/clear', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        if (taskRepos.backend === 'baserow') {
          return reply.status(409).send({ error: 'Baserow 数据清空需要在数据库内逐项确认，LinX 不会静默删除' })
        }
        const convId = 'conv_' + userId
        const ts = clock().toISOString()
        const tables = ['tasks', 'todo_ideas', 'non_todo_outputs', 'projects', 'capture_records', 'corrections', 'ai_errors', 'chat_messages', 'subtasks', 'comments', 'activity', 'notifications']
        // 承 legacy db.tx：此处顺序执行（Queryable 无事务原语）；happy-path 等价。
        for (const table of tables) await db.execute(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
        await db.execute('DELETE FROM task_collaborators WHERE owner_id = $1 OR user_id = $2', [userId, userId])
        await db.execute('DELETE FROM conversations WHERE user_id = $1 AND id <> $2', [userId, convId])
        await db.execute(
          `INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ($1,$2,'默认对话',$3,$4)
           ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
          [convId, userId, ts, ts],
        )
        await db.execute(
          `INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ($1,$2,$3,'agent',$4,0,$5)`,
          [genId('msg'), userId, convId, '数据已清空。把任何想法丢给我，重新开始。', ts],
        )
        return { ok: true }
      })
    },
  }
}
