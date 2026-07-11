// Database task sort strategies: sort-key → comparator registry.
// DUE_ORDER + STATUS_ORDER extracted from useDatabaseBoard for reuse.
import type { TaskItem } from '../types'
import type { TaskStatus } from '@/shared/enums/task-status'

export const DUE_ORDER: Record<string, number> = {
  '昨天': 0, '今天': 1, '明天': 2, '后天': 3,
  '周一': 4, '周二': 4, '周三': 4, '周四': 5, '周五': 6,
  '下周': 8, '月底': 9, '待定': 99,
}

export const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 }

function dueOrd(d: string): number {
  for (const k in DUE_ORDER) { if (d && d.indexOf(k) >= 0) return DUE_ORDER[k] }
  return 50
}

export type SortComparator = (a: TaskItem, b: TaskItem, dir: number) => number

export const SORT_COMPARATORS: Record<string, SortComparator> = {
  title: (a, b, dir) => dir * a.title.localeCompare(b.title, 'zh'),
  project: (a, b, dir) => dir * a.project.localeCompare(b.project, 'zh'),
  priority: (a, b, dir) => dir * (a.priority - b.priority),
  due: (a, b, dir) => dir * (dueOrd(a.due) - dueOrd(b.due)),
  status: (a, b, dir) => dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
}
