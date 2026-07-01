import { visibleFilter } from './privacy.js'

const has = (text, q) => (text || '').toLowerCase().includes(q)

// Command-palette search: tasks + ideas + projects (privacy-filtered).
export function search(repos, q) {
  const query = (q || '').trim().toLowerCase()
  if (!query) return { results: [] }
  const settings = repos.settings.get()
  const tasks = visibleFilter(repos.tasks.all(), settings)
    .filter((t) => has(t.title, query) || (t.tags || []).some((tag) => has(tag, query)))
    .map((t) => ({ type: 'task', id: t.id, label: t.title }))
  const ideas = visibleFilter(repos.ideas.all(), settings)
    .filter((i) => has(i.title, query) || has(i.rawText, query))
    .map((i) => ({ type: 'todo_idea', id: i.id, label: i.title }))
  const projects = visibleFilter(repos.projects.all(), settings)
    .filter((p) => has(p.name, query))
    .map((p) => ({ type: 'project', id: p.id, label: p.name }))
  return { results: [...tasks, ...ideas, ...projects] }
}

// @-mention search: tasks + projects (empty query returns recent items).
export function mentions(repos, q) {
  const query = (q || '').trim().toLowerCase()
  const settings = repos.settings.get()
  const projects = visibleFilter(repos.projects.all(), settings)
    .filter((p) => !query || has(p.name, query))
    .slice(0, 8)
    .map((p) => ({ type: 'project', id: p.id, label: p.name }))
  const tasks = visibleFilter(repos.tasks.all(), settings)
    .filter((t) => !query || has(t.title, query))
    .slice(0, 8)
    .map((t) => ({ type: 'task', id: t.id, label: t.title }))
  return { results: [...projects, ...tasks] }
}
