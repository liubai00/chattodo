import { isToday } from '../lib/dates.js'

// Filter the task list for the database views (matches the design's view/scope/search).
export function filterTasks(tasks, { view = 'all', scope = 'all', search = '' } = {}) {
  let out = tasks
  if (scope && scope !== 'all') out = out.filter((t) => t.privacyScope === scope)
  if (view === 'open') out = out.filter((t) => t.status === 'todo' || t.status === 'in_progress')
  else if (view === 'done') out = out.filter((t) => t.status === 'done')
  else if (view === 'today') out = out.filter((t) => isToday(t.dueAt) || isToday(t.plannedAt))
  const q = (search || '').trim().toLowerCase()
  if (q) {
    out = out.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(q)))
  }
  return out
}

// Move a task out of the todo system into the isolation area (misclassification fix).
// Preserves the original raw input + generation record and logs a correction.
export async function moveOutOfTodo(repos, id) {
  const task = await repos.tasks.get(id)
  if (!task) return null
  const rec = await repos.captureRecords.getByEntity('task', id)
  const non = await repos.nonTodos.create({
    title: task.title,
    summary: task.notes || task.title,
    rawText: rec?.rawInput || task.notes || task.title,
    reason: rec?.aiReason || '用户手动从 todo 主系统移出（误分类纠错）。',
    suggestedDestination: 'archive',
    privacyScope: task.privacyScope,
    source: 'correction',
    corrected: true,
  })
  await repos.captureRecords.relink(id, 'non_todo', non.id)
  await repos.corrections.create({ entityType: 'non_todo', entityId: non.id, fromKind: 'task', toKind: 'non_todo', note: '移出 todo（误分类纠错）' })
  await repos.tasks.remove(id)
  return non
}
