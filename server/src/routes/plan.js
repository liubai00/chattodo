import { planNextBlock } from '../services/planning.js'
import { visibleFilter } from '../services/privacy.js'

// POST /api/plan — plan the next block from visible, actionable tasks.
export default async function planRoutes(app) {
  const { repos } = app
  app.post('/api/plan', async (req) => {
    const settings = repos.settings.get()
    const tasks = visibleFilter(repos.tasks.all(), settings)
    const blockMinutes = Number(req.body?.blockMinutes) || 120
    return planNextBlock(tasks, blockMinutes)
  })
}
