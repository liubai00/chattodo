// Convert a clarified idea into a task (mirrors IDEA_CONVERT in src/store.jsx).
export function convertIdeaToTask(repos, id) {
  const idea = repos.ideas.get(id)
  if (!idea) return null
  const task = repos.tasks.create({
    title: idea.title, notes: idea.rawText, status: 'todo', projectId: null,
    tags: [], context: '', dueAt: null, plannedAt: null, durationMinutes: 30,
    priority: 3, privacyScope: idea.privacyScope, sourceIdeaId: idea.id,
  })
  const updated = repos.ideas.update(id, { status: 'converted' })
  repos.activity.log(task.id, '由待澄清项转为任务')
  return { task, idea: updated }
}

// Manually convert an isolated non-todo into a task (mirrors NON_TO_TODO in src/store.jsx).
export function convertNonToTask(repos, id) {
  const non = repos.nonTodos.get(id)
  if (!non) return null
  const task = repos.tasks.create({
    title: non.title, notes: non.rawText, status: 'todo', projectId: null,
    tags: [], context: '', dueAt: null, plannedAt: null, durationMinutes: 30,
    priority: 3, privacyScope: non.privacyScope, sourceIdeaId: null,
  })
  repos.nonTodos.remove(id)
  repos.activity.log(task.id, '由非 todo 转为任务')
  return { task }
}
