import { formatDue, isOverdue, isToday, PRIORITY_LABEL, SCOPE_LABEL } from '../lib/utils'

export function ScopeChip({ scope }) {
  return <span className={`chip scope-${scope}`}>{SCOPE_LABEL[scope] || scope}</span>
}

export function DueChip({ dueAt }) {
  if (!dueAt) return null
  const cls = isOverdue(dueAt) ? 'over' : isToday(dueAt) ? 'today' : ''
  return <span className={`chip due ${cls}`}>⏱ {formatDue(dueAt)}</span>
}

export function PriorityChip({ priority }) {
  const cls = priority <= 1 ? 'p1' : priority === 2 ? 'p2' : 'p3'
  return <span className={`chip ${cls}`}>{PRIORITY_LABEL[priority] || `P${priority}`}</span>
}

export function TagChips({ tags }) {
  if (!tags || !tags.length) return null
  return tags.map((t) => (
    <span key={t} className="chip tag">
      #{t}
    </span>
  ))
}
