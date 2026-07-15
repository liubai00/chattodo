// @linx/app-plan — 「接下来两小时」规划 + 落地（承接 services/planning.js + routes/plan.js）。
import { visibleFilter } from '@linx/domain-settings'

export interface PlanTask {
  id: string
  title: string
  status: string
  dueAt?: string | null
  priority: number
  durationMinutes?: number | null
  privacyScope?: string
}
export interface PlanItem {
  task: PlanTask
  minutes: number
}
export interface PlanResult {
  plan: PlanItem[]
  totalMinutes: number
}

/**
 * plan_next_block —— 仅从【可见 Task】构建 2 小时计划（verbatim 承接 src/lib/planning.js）。
 * 永不读 NonTodo；调用方须先过隐私过滤 + 传入 actionable 任务。排序：到期↑ → 优先级↑ → 时长↑。
 */
export function planNextBlock(visibleTasks: readonly PlanTask[], blockMinutes = 120): PlanResult {
  const candidates = visibleTasks
    .filter((t) => t.status !== 'done' && t.status !== 'archived')
    .slice()
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
      if (aDue !== bDue) return aDue - bDue
      if (a.priority !== b.priority) return a.priority - b.priority
      return (a.durationMinutes || 30) - (b.durationMinutes || 30)
    })

  const plan: PlanItem[] = []
  let used = 0
  for (const t of candidates) {
    const dur = t.durationMinutes || 30
    if (used + dur > blockMinutes + 15) continue
    plan.push({ task: t, minutes: dur })
    used += dur
    if (plan.length >= 4 || used >= blockMinutes) break
  }
  return { plan, totalMinutes: used }
}

export interface PlanAppDeps {
  settings: { get(): Promise<{ privacyMode: boolean; workspaceMode: string } | undefined> }
  tasks: {
    all(): Promise<PlanTask[]>
    get(id: string): Promise<PlanTask | undefined>
    update(id: string, patch: { plannedAt?: string }): Promise<PlanTask | undefined>
  }
  activity: { log(taskId: string, text: string): Promise<void> }
  /** epoch 毫秒源（commit 用；注入以便测试）。 */
  now?: () => number
}

export interface PlanCommitItem {
  id?: string
  minutes?: number
}

export function makePlanApp(deps: PlanAppDeps) {
  const { settings, tasks, activity } = deps
  const now = deps.now ?? ((): number => Date.now())

  return {
    async plan(blockMinutes = 120): Promise<PlanResult> {
      const s = (await settings.get()) ?? { privacyMode: false, workspaceMode: 'work' }
      const visible = visibleFilter(await tasks.all(), s)
      return planNextBlock(visible, blockMinutes)
    },

    // 把计划写进任务：按顺序从现在起排布 plannedAt（承 routes/plan.js commit）。
    async commit(items: readonly PlanCommitItem[]): Promise<{ updated: (PlanTask | undefined)[] }> {
      const slice = Array.isArray(items) ? items.slice(0, 12) : []
      let cursor = now()
      const updated: (PlanTask | undefined)[] = []
      for (const it of slice) {
        const t = it && it.id ? await tasks.get(it.id) : null
        if (!t || t.status === 'done' || t.status === 'archived') continue
        const minutes = Math.min(Math.max(Number(it.minutes) || 30, 5), 240)
        const task = await tasks.update(t.id, { plannedAt: new Date(cursor).toISOString() })
        await activity.log(t.id, '加入执行计划')
        cursor += minutes * 60000
        updated.push(task)
      }
      return { updated }
    },
  }
}
