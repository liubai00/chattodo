// Shared task display constants: memberColor, PRIO_COLORS, STATUS_LABEL, visible.
// DRY across useDatabaseBoard, useProjects, useTaskDetail — all import from here.
// The canonical source is strategies/task-presentation.ts; this re-exports for use by
// composables that are NOT in the tasks module (and avoids circular imports).
import type { TaskStatus } from '@/shared/enums/task-status'
import type { Workspace } from '@/shared/enums/workspace'

export type Scope = Workspace | 'mixed'

export const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']

export const PRIO_COLORS: Record<number, [string, string]> = {
  1: ['var(--danger)', 'var(--danger-bg)'],
  2: ['var(--idea)', 'var(--idea-bg)'],
  3: ['var(--text2)', 'var(--mid)'],
  4: ['var(--text3)', 'var(--mid)'],
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成',
}

export function memberColor(name: string): string {
  if (!name) return 'var(--cat-fallback)'
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}

export function visible(scope: Scope, privacy: boolean, workspace: Workspace): boolean {
  return !privacy || scope === workspace || scope === 'mixed'
}
