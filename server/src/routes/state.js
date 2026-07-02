import { visibleFilter } from '../services/privacy.js'

// Generate due-today / overdue notifications for open tasks (one per task per day).
// 协作任务：接受时选择了「不提醒」(remind=false) 的不生成。
function generateDueNotifications(repos, tasks, collabMap) {
  const sod = (x) => { const d = new Date(x); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
  const today = sod(new Date())
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'archived' || !t.dueAt) continue
    const c = collabMap && collabMap.get(t.id)
    if (c && !c.remind) continue
    const due = sod(t.dueAt)
    if (due > today) continue
    const overdue = due < today
    const text = overdue ? `「${t.title}」已逾期，尽快处理或调整截止时间` : `「${t.title}」今天到期`
    if (repos.notifications.existsToday(text)) continue
    repos.notifications.create({
      type: 'due',
      icon: overdue ? 'ph-warning-circle' : 'ph-clock',
      color: overdue ? 'var(--danger)' : 'var(--idea)',
      text,
    })
  }
}

// GET /api/state — full snapshot the frontend loads on mount (per user).
export default async function stateRoutes(app) {
  app.get('/api/state', async (req) => {
    const repos = req.repos
    const settings = repos.settings.get()
    const collabMap = repos.collaborators.myAcceptedMap()
    // 协作任务带来源标记（from = owner 名字）
    const tasks = repos.tasks.all().map((t) => {
      const c = collabMap.get(t.id)
      return c ? { ...t, collabFrom: c.from, collabRemind: c.remind } : t
    })
    const todoIdeas = repos.ideas.all()
    const nonTodoOutputs = repos.nonTodos.all()
    generateDueNotifications(repos, tasks, collabMap)
    // 历史回链：用户消息 → 它生成的实体（按原文匹配最近一条生成记录）
    const recordByRaw = new Map()
    for (const r of repos.captureRecords.all()) { // DESC：先出现的是最新
      if (r.rawInput && r.resultEntityId && !recordByRaw.has(r.rawInput)) {
        recordByRaw.set(r.rawInput, { refType: r.resultEntityType, refId: r.resultEntityId })
      }
    }
    const chat = repos.chat.all().map((m) => {
      if (m.role !== 'user') return m
      const ref = recordByRaw.get(m.text)
      return ref ? { ...m, ...ref } : m
    })
    return {
      user: req.user || null,
      agentProfile: repos.agent.get(),
      appSettings: settings,
      projects: repos.projects.all(),
      tasks,
      todoIdeas,
      nonTodoOutputs,
      notifications: repos.notifications.all(),
      invites: repos.collaborators.myPending(),
      chat,
      visible: {
        tasks: visibleFilter(tasks, settings),
        todoIdeas: visibleFilter(todoIdeas, settings),
        nonTodoOutputs: visibleFilter(nonTodoOutputs, settings),
      },
    }
  })
}
