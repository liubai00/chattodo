// Database view filter strategies: pure predicate registry.
// Replaces the if-else chain in useDatabaseBoard.tbl computed.
import type { DbView, TaskItem } from '../types'

export const VIEW_FILTERS: Record<DbView, (t: TaskItem) => boolean> = {
  all: () => true,
  today: (t) => t.today,
  open: (t) => t.status !== 'done',
  done: (t) => t.status === 'done',
  collab: (t) => !!t.collabFrom,
}
