import { visibleFilter } from '../services/privacy.js'

// GET /api/state — full snapshot the frontend loads on mount (per user).
export default async function stateRoutes(app) {
  app.get('/api/state', async (req) => {
    const repos = req.repos
    const settings = repos.settings.get()
    const tasks = repos.tasks.all()
    const todoIdeas = repos.ideas.all()
    const nonTodoOutputs = repos.nonTodos.all()
    return {
      user: req.user || null,
      agentProfile: repos.agent.get(),
      appSettings: settings,
      projects: repos.projects.all(),
      tasks,
      todoIdeas,
      nonTodoOutputs,
      notifications: repos.notifications.all(),
      chat: repos.chat.all(),
      visible: {
        tasks: visibleFilter(tasks, settings),
        todoIdeas: visibleFilter(todoIdeas, settings),
        nonTodoOutputs: visibleFilter(nonTodoOutputs, settings),
      },
    }
  })
}
