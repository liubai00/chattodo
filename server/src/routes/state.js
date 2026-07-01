import { visibleFilter } from '../services/privacy.js'

// GET /api/state — full snapshot the frontend loads on mount.
export default async function stateRoutes(app) {
  app.get('/api/state', async () => {
    const { repos } = app
    const settings = repos.settings.get()
    const tasks = repos.tasks.all()
    const todoIdeas = repos.ideas.all()
    const nonTodoOutputs = repos.nonTodos.all()
    return {
      agentProfile: repos.agent.get(),
      appSettings: settings,
      projects: repos.projects.all(),
      tasks,
      todoIdeas,
      nonTodoOutputs,
      chat: repos.chat.all(),
      visible: {
        tasks: visibleFilter(tasks, settings),
        todoIdeas: visibleFilter(todoIdeas, settings),
        nonTodoOutputs: visibleFilter(nonTodoOutputs, settings),
      },
    }
  })
}
