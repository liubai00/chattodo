import { visibleFilter } from './privacy.js'

const has = (text, q) => (text || '').toLowerCase().includes(q)

// Command-palette search: tasks + ideas + projects (privacy-filtered).
export async function search(repos, q) {
  const query = (q || '').trim().toLowerCase()
  if (!query) return { results: [] }
  const [settings, taskRows, ideaRows, projRows] = await Promise.all([repos.settings.get(), repos.tasks.all(), repos.ideas.all(), repos.projects.all()])
  const tasks = visibleFilter(taskRows, settings)
    .filter((t) => has(t.title, query) || (t.tags || []).some((tag) => has(tag, query)))
    .map((t) => ({ type: 'task', id: t.id, label: t.title }))
  const ideas = visibleFilter(ideaRows, settings)
    .filter((i) => has(i.title, query) || has(i.rawText, query))
    .map((i) => ({ type: 'todo_idea', id: i.id, label: i.title }))
  const projects = visibleFilter(projRows, settings)
    .filter((p) => has(p.name, query))
    .map((p) => ({ type: 'project', id: p.id, label: p.name }))
  return { results: [...tasks, ...ideas, ...projects] }
}

// @-mention search: tasks + projects (empty query returns recent items).
export async function mentions(repos, q) {
  const query = (q || '').trim().toLowerCase()
  const [settings, projRows, taskRows] = await Promise.all([repos.settings.get(), repos.projects.all(), repos.tasks.all()])
  const projects = visibleFilter(projRows, settings)
    .filter((p) => !query || has(p.name, query))
    .slice(0, 8)
    .map((p) => ({ type: 'project', id: p.id, label: p.name }))
  const tasks = visibleFilter(taskRows, settings)
    .filter((t) => !query || has(t.title, query))
    .slice(0, 8)
    .map((t) => ({ type: 'task', id: t.id, label: t.title }))
  return { results: [...projects, ...tasks] }
}
