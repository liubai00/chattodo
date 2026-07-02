import { planNextBlock } from '../services/planning.js'
import { visibleFilter } from '../services/privacy.js'

// POST /api/plan — plan the next block from visible, actionable tasks.
// POST /api/plan/commit — 把计划写进任务：按顺序设置 plannedAt（从现在开始逐项排布）。
export default async function planRoutes(app) {
  app.post('/api/plan', async (req) => {
    const repos = req.repos
    const settings = repos.settings.get()
    const tasks = visibleFilter(repos.tasks.all(), settings)
    const blockMinutes = Number(req.body?.blockMinutes) || 120
    return planNextBlock(tasks, blockMinutes)
  })

  app.post('/api/plan/commit', async (req) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 12) : []
    let cursor = Date.now()
    const updated = []
    for (const it of items) {
      const t = it && it.id ? req.repos.tasks.get(it.id) : null
      if (!t || t.status === 'done' || t.status === 'archived') continue
      const minutes = Math.min(Math.max(Number(it.minutes) || 30, 5), 240)
      const task = req.repos.tasks.update(t.id, { plannedAt: new Date(cursor).toISOString() })
      req.repos.activity.log(t.id, '加入执行计划')
      cursor += minutes * 60000
      updated.push(task)
    }
    return { updated }
  })
}
