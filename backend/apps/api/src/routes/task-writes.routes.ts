import type { FastifyReply, FastifyRequest } from 'fastify'
import { makePrefixedId } from '@linx/kernel-ids'
import {
  makeCommentRepo,
  makeSubtaskRepo,
  makeCaptureRecordRepo,
  makeActivityRepo,
  type Queryable,
} from '@linx/infra-tasks-pg'
import { makeCollaboratorRepo } from '@linx/infra-collab-pg'
import type { MigratedPlugin } from '../facade/build-api.js'
import {
  makeClocks,
  makeNotifierForUser,
  makeUserDirectory,
  buildSocialApp,
} from '../composition/wiring.js'
import { buildCollabApp } from '../composition/chat-wiring.js'
import { actorFromUser, createTaskRepoFactory, type TaskRepoFactory } from '../composition/task-repo-factory.js'

export interface TaskWritesPluginDeps {
  db: Queryable
  taskRepos?: TaskRepoFactory
  publish: (userId: string, payload: unknown) => void
  publishMany: (userIds: readonly string[], payload: unknown) => void
  clock?: () => Date
  genId?: (prefix: string) => string
}

const STATUS_LABEL: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '已完成', archived: '已归档' }

/**
 * Tasks BC 写路由（组 'tasks'，第二插件）：承接现网 tasks.js 的跨用户副作用写路由。
 *   PATCH  /api/tasks/:id           — 更新（done→notifyTaskDone；assignee→指派通知）
 *   POST   /api/tasks/:id/done      — 完成 + notifyTaskDone
 *   DELETE /api/tasks/:id           — owner-only 删除 + 通知协作者 + 失效邀请通知 + 清协作
 *   GET    /api/tasks/:id/detail    — 任务 + 协作人 + 子任务 + 评论 + 活动 + 生成记录
 *   POST   /api/tasks/:id/comments  — 评论 + @提及通知（好友收口）
 * 跨用户通知经 collab.notifyTaskDone / 好友收口的 notifier（挂 platform-eventbus，实时可达）。
 */
export function makeTaskWritesPlugin(deps: TaskWritesPluginDeps): MigratedPlugin {
  const { db, publish, publishMany } = deps
  const taskRepos = deps.taskRepos ?? createTaskRepoFactory({ db })
  const clock = deps.clock ?? ((): Date => new Date())
  const genId = deps.genId ?? ((p: string): string => makePrefixedId(p)())
  const { nowIso } = makeClocks(clock)

  const forUser = (actor: { id: string; name: string; email: string; role: string }) => ({
    tasks: taskRepos.forRequest({
      actor: actorFromUser(actor),
      source: { kind: 'manual', text: '用户通过 LinX API 修改任务' },
      clock,
      genId,
    }),
    userId: actor.id,
    collaborators: makeCollaboratorRepo({ db, userId: actor.id, clock, genId }),
    comments: makeCommentRepo({ db, userId: actor.id, clock, genId }),
    subtasks: makeSubtaskRepo({ db, userId: actor.id, clock, genId }),
    captureRecords: makeCaptureRecordRepo({ db, userId: actor.id, clock, genId }),
    activity: makeActivityRepo({ db, userId: actor.id, clock, genId }),
    collab: buildCollabApp({ db, userId: actor.id, publish, publishMany, clock, genId }),
    social: buildSocialApp({ db, publish, nowIso, genId, clock }),
    userDir: makeUserDirectory(db),
    notifier: makeNotifierForUser(db, publish, actor.id, { nowIso, genId }),
  })
  type Ctx = ReturnType<typeof forUser>

  // 跨用户通知（好友收口）：按显示名找成员，仅通知自己的好友（防拿任意名字骚扰/探测）。
  const notifyByName = async (ctx: Ctx, name: string, actor: { id: string; name: string }, text: string, icon = 'ph-user-switch'): Promise<void> => {
    if (!name || name === actor.name) return
    const target = await ctx.userDir.byName(name)
    if (!target || target.id === actor.id) return
    if (!(await ctx.social.isFriend(actor.id, target.id))) return
    await ctx.notifier.push(target.id, { type: 'assign', icon, color: 'var(--accent-ink)', text })
  }

  const actor = (req: FastifyRequest, reply: FastifyReply): { id: string; name: string; email: string; role: string } | undefined => {
    const u = req.user
    if (!u) {
      void reply.status(401).send({ error: 'unauthorized', code: 'UNAUTHENTICATED' })
      return undefined
    }
    return { id: u.id, name: u.name, email: u.email, role: u.role }
  }
  const pid = (req: FastifyRequest): string => (req.params as { id: string }).id

  return {
    group: 'tasks',
    register: async (app) => {
      app.get('/api/tasks/:id/detail', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        if (taskRepos.backend === 'baserow') {
          return reply.status(410).send({ error: '任务详情已由 Baserow 行面板取代' })
        }
        const ctx = forUser(me)
        const id = pid(req)
        const task = await ctx.tasks.get(id)
        if (!task) return reply.status(404).send({ error: 'task not found' })
        const [access, collaborators, generationRecord, subtasks, comments, activity] = await Promise.all([
          ctx.tasks.access(id),
          ctx.collaborators.forTask(id),
          ctx.captureRecords.getByEntity('task', id),
          ctx.subtasks.byTask(id),
          ctx.comments.byTask(id),
          ctx.activity.byTask(id),
        ])
        return { task, access, collaborators, generationRecord: generationRecord ?? null, subtasks, comments, activity }
      })

      app.patch('/api/tasks/:id', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const ctx = forUser(me)
        const id = pid(req)
        const prev = await ctx.tasks.get(id)
        if (!prev) return reply.status(404).send({ error: 'task not found' })
        const patch = (req.body ?? {}) as { status?: string; assignee?: string; [k: string]: unknown }
        // 路由边界：现网信任前端 body；此处强转到 TaskPatch（infra 层再做 owner/collaborator 门禁）。
        const updated = await ctx.tasks.update(id, patch as never)
        if (patch.status && patch.status !== prev.status) {
          if (taskRepos.backend === 'legacy') await ctx.activity.log(prev.id, '状态改为「' + (STATUS_LABEL[patch.status] || patch.status) + '」')
        }
        if (taskRepos.backend === 'legacy' && patch.status === 'done' && prev.status !== 'done') await ctx.collab.notifyTaskDone(me, prev.id)
        if (patch.assignee && patch.assignee !== prev.assignee) {
          if (taskRepos.backend === 'legacy') await ctx.activity.log(prev.id, '指派给 ' + patch.assignee)
          if (taskRepos.backend === 'legacy') {
            await notifyByName(ctx, patch.assignee, me, `${me.name || '有人'} 把「${prev.title}」指派给你`)
          }
        }
        return updated
      })

      app.post('/api/tasks/:id/done', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        const ctx = forUser(me)
        const id = pid(req)
        const prev = await ctx.tasks.get(id)
        if (!prev) return reply.status(404).send({ error: 'task not found' })
        const t = await ctx.tasks.update(id, { status: 'done' })
        if (taskRepos.backend === 'legacy') await ctx.activity.log(id, '状态改为「已完成」')
        if (taskRepos.backend === 'legacy' && prev.status !== 'done') await ctx.collab.notifyTaskDone(me, id)
        return t
      })

      app.delete('/api/tasks/:id', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        if (
          taskRepos.backend === 'baserow' &&
          (req.body as { confirmation?: unknown } | undefined)?.confirmation !== 'confirmed-by-linx'
        ) {
          return reply.status(409).send({
            error: '删除任务前需要明确确认',
            code: 'CONFIRMATION_REQUIRED',
            action: 'row.delete',
          })
        }
        const ctx = forUser(me)
        const id = pid(req)
        const task = await ctx.tasks.get(id)
        if (!task) return reply.status(404).send({ error: 'task not found' })
        if ((await ctx.tasks.access(id)) !== 'owner') {
          return reply.status(403).send({ error: '协作任务只有创建者可以删除，你可以选择「退出协作」' })
        }
        if (taskRepos.backend === 'legacy') {
          for (const uid of await ctx.collaborators.acceptedUsersOf(id)) {
            await ctx.notifier.push(uid, { type: 'assign', icon: 'ph-trash', color: 'var(--danger)', text: `「${task.title}」已被 ${me.name || '创建者'} 删除` })
          }
          // 失效该任务相关邀请通知的按钮
          await db.execute('UPDATE notifications SET handled = 1, read = 1 WHERE action_ref IN (SELECT id FROM task_collaborators WHERE task_id = $1)', [id])
          await ctx.collaborators.removeForTask(id)
        }
        await ctx.tasks.remove(id)
        return { ok: true }
      })

      app.post('/api/tasks/:id/comments', async (req, reply) => {
        const me = actor(req, reply)
        if (!me) return
        if (taskRepos.backend === 'baserow') {
          return reply.status(410).send({ error: '任务评论不在 Baserow 首版范围内' })
        }
        const ctx = forUser(me)
        const id = pid(req)
        const task = await ctx.tasks.get(id)
        if (!task) return reply.status(404).send({ error: 'task not found' })
        const b = (req.body ?? {}) as { text?: unknown; author?: unknown }
        const text = String(b.text ?? '').trim()
        if (!text) return reply.status(400).send({ error: 'text is required' })
        const cmt = await ctx.comments.create(id, String(b.author ?? me.name ?? '我'), text)
        await ctx.activity.log(id, '发表了评论')
        const mentioned = [...new Set([...text.matchAll(/@([^\s@，。,、.!！?？]{1,20})/g)].map((m) => m[1] as string))]
        for (const name of mentioned) {
          await notifyByName(ctx, name, me, `${me.name || '有人'} 在「${task.title}」的评论中提到了你`, 'ph-chat-circle')
        }
        return cmt
      })
    },
  }
}
