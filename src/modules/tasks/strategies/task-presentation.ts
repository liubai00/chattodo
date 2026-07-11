// Database task presentation helpers: constants + pure display functions.
// Extracted from useDatabaseBoard fmtTask; shared via Phase 3 task-display constants.
import type { TaskStatus } from '@/shared/enums/task-status'
import type { Scope } from '../types'
import type { Workspace } from '@/shared/enums/workspace'

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

// ---- fmtTask 纯展示拆出 ----
export function fmtTitleColor(done: boolean): string { return done ? 'var(--text3)' : 'var(--text)' }
export function fmtTitleDeco(done: boolean): string { return done ? 'text-decoration:line-through;' : '' }
export function fmtDueColor(due: string, today: boolean): string {
  return (due === '今天 17:00' || due === '明天' || today) ? 'var(--accent-ink)' : 'var(--text2)'
}
export function fmtPrioStyle(priority: number): string {
  const pc = PRIO_COLORS[priority] || PRIO_COLORS[3]
  return 'display:inline-flex;padding:3px 8px;border-radius:6px;font:700 11px/1 var(--font);color:' + pc[0] + ';background:' + pc[1] + ';'
}
export function fmtStatusLabel(status: TaskStatus, collabFrom: string | null): string {
  const base = STATUS_LABEL[status]
  return collabFrom ? base + ' · 来自 ' + collabFrom : base
}
export function fmtScopeColor(scope: Scope): string { return scope === 'work' ? 'var(--accent)' : 'var(--idea)' }
export function fmtScopeLabel(scope: Scope): string { return scope === 'work' ? '工作' : '个人' }
