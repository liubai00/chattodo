import type { FastifyReply, FastifyRequest } from 'fastify'
import { makePrefixedId } from '@linx/kernel-ids'
import { makeTaskRepo, makeIdeaRepo, makeNonTodoRepo, type Queryable } from '@linx/infra-tasks-pg'
import { makeProjectRepo } from '@linx/infra-projects-pg'
import { makeSettingsRepo, makeAgentRepo } from '@linx/infra-settings-pg'
import { makeConversationRepo, makeChatReadRepo } from '@linx/infra-conversations-pg'
import { makeNotificationRepo } from '@linx/infra-notifications-pg'
import { makeCollaboratorRepo } from '@linx/infra-collab-pg'
import { visibleFilter } from '@linx/domain-settings'
import type { MigratedPlugin } from '../facade/build-api.js'

export interface StatePluginDeps {
  db: Queryable
  clock?: () => Date
  genId?: (prefix: string) => string
}

interface Taskish {
  id: string
  title: string
  status: string
  dueAt?: string | null
  privacyScope?: string
}

/**
 * State BC 已迁移路由（组 'state'）：GET /api/state —— 前端挂载时加载的全量快照（按用户）。
 * 聚合 settings/tasks/ideas/nonTodos/projects/records/chat/invites/agent/conversations/notifications，
 * 生成到期/逾期通知，打协作来源标记 + 历史回链，附隐私过滤后的 visible。
 */
export function makeStatePlugin(deps: StatePluginDeps): MigratedPlugin {
  const { db } = deps
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

  const sod = (x: string | Date): number => {
    const d = new Date(x)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }

  return {
    group: 'state',
    register: async (app) => {
      app.get('/api/state', async (req, reply) => {
        const userId = uid(req, reply)
        if (!userId) return
        const opt = { db, userId, clock, genId }
        const tasksRepo = makeTaskRepo(opt)
        const ideasRepo = makeIdeaRepo(opt)
        const nonRepo = makeNonTodoRepo(opt)
        const projRepo = makeProjectRepo({ db, userId })
        const settingsRepo = makeSettingsRepo({ db, userId, clock })
        const agentRepo = makeAgentRepo({ db, userId, clock })
        const convRepo = makeConversationRepo({ db, userId, clock, genId })
        const chatRepo = makeChatReadRepo({ db, userId })
        const notifRepo = makeNotificationRepo({ db, userId, clock, genId })
        const collabRepo = makeCollaboratorRepo({ db, userId, clock, genId })

        const activeConversationId = (await convRepo.latestId()) || (await convRepo.ensureDefault())
        const [settings, collabMap, rawTasks, todoIdeas, nonTodoOutputs, projects, records, chatRows, invites, agentProfile, conversations] =
          await Promise.all([
            settingsRepo.get(),
            collabRepo.myAcceptedMap(),
            tasksRepo.all(),
            ideasRepo.all(),
            nonRepo.all(),
            projRepo.all(),
            db.execute<{ raw_input: string | null; result_entity_type: string | null; result_entity_id: string | null }>(
              'SELECT raw_input, result_entity_type, result_entity_id FROM capture_records WHERE user_id = $1 ORDER BY created_at DESC',
              [userId],
            ),
            chatRepo.all(activeConversationId),
            collabRepo.myPending(),
            agentRepo.get(),
            convRepo.list(),
          ])

        // 协作任务来源标记
        const tasks = (rawTasks as Taskish[]).map((t) => {
          const c = collabMap.get(t.id)
          return c ? { ...t, collabFrom: c.from, collabRemind: c.remind } : t
        })

        // 到期/逾期通知（每任务每天一条；remind=false 的协作任务不生成）
        const settingsVal = settings ?? { privacyMode: false, workspaceMode: 'work' }
        const today = sod(clock())
        for (const t of tasks) {
          if (t.status === 'done' || t.status === 'archived' || !t.dueAt) continue
          const c = collabMap.get(t.id)
          if (c && !c.remind) continue
          const due = sod(t.dueAt)
          if (due > today) continue
          const overdue = due < today
          const text = overdue ? `「${t.title}」已逾期，尽快处理或调整截止时间` : `「${t.title}」今天到期`
          if (await notifRepo.existsToday(text)) continue
          await notifRepo.create({
            type: 'due',
            icon: overdue ? 'ph-warning-circle' : 'ph-clock',
            color: overdue ? 'var(--danger)' : 'var(--idea)',
            text,
          })
        }

        // 历史回链：用户消息 → 生成实体（最近一条）
        const recordByRaw = new Map<string, { refType: string; refId: string }>()
        for (const r of records) {
          if (r.raw_input && r.result_entity_id && !recordByRaw.has(r.raw_input)) {
            recordByRaw.set(r.raw_input, { refType: r.result_entity_type ?? '', refId: r.result_entity_id })
          }
        }
        const chat = chatRows.map((m) => {
          if (m.role !== 'user') return m
          const ref = recordByRaw.get(m.text)
          return ref ? { ...m, ...ref } : m
        })

        return {
          user: req.user ?? null,
          agentProfile,
          appSettings: settings,
          projects,
          tasks,
          todoIdeas,
          nonTodoOutputs,
          notifications: await notifRepo.all(),
          invites,
          chat,
          conversations,
          activeConversationId,
          visible: {
            tasks: visibleFilter(tasks, settingsVal),
            todoIdeas: visibleFilter(todoIdeas, settingsVal),
            nonTodoOutputs: visibleFilter(nonTodoOutputs, settingsVal),
          },
        }
      })
    },
  }
}
