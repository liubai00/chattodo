// plan_next_block — builds a 2-hour plan from visible Tasks only.
// Never reads NonTodoOutput; never reads privacy-hidden or archived tasks.

export function planNextBlock(visibleTasks, blockMinutes = 120) {
  const candidates = visibleTasks
    .filter((t) => t.status !== 'done' && t.status !== 'archived')
    .slice()
    .sort((a, b) => {
      // 1. due soonest, 2. priority high, 3. shorter duration.
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
      if (aDue !== bDue) return aDue - bDue
      if (a.priority !== b.priority) return a.priority - b.priority
      return (a.durationMinutes || 30) - (b.durationMinutes || 30)
    })

  const plan = []
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
