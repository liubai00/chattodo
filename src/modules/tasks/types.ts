// 任务域视图模型类型（数据库视图用）：TaskItem / FmtTask(渲染模型) / BoardCol / 后端原始行 / 视图 props。
import type { Workspace } from '@/shared/enums/workspace'
import type { TaskStatus } from '@/shared/enums/task-status'

export type Scope = Workspace | 'mixed'
export type DbView = 'all' | 'today' | 'open' | 'done' | 'collab'
export type DbLayout = 'table' | 'board'

export interface TaskItem {
  id: string; title: string; status: TaskStatus; project: string
  due: string; today: boolean; priority: number; scope: Scope
  assignee: string | null; collabFrom: string | null
}

// 后端任务行（数据库视图 mapTask 输入；字段与 types/api.ts 的 Task 不完全一致，按真实形状收窄）。
export interface DbRawTask {
  id: string; title: string; status: TaskStatus
  project?: string | null; dueAt?: string | null
  today?: boolean; priority?: number
  privacyScope?: string; assignee?: string | null; collabFrom?: string | null
}

// getState 返回（数据库视图只用到 tasks）。
export interface DbState {
  tasks?: DbRawTask[]
  [k: string]: unknown
}

// 表格行 / 看板卡片渲染模型（携带动作闭包，模板零 emit 即可调）。
export interface FmtTask {
  id: string; title: string; project: string; due: string
  statusLabel: string; collabFrom: string | null
  selected: boolean; rowBg: string; selBoxStyle: string; selCheck: string
  toggleSel: (e: Event) => void
  titleColor: string; titleDeco: string; dueColor: string
  prio: string; prioStyle: string
  assignee: string; assigneeInitial: string; assigneeColor: string
  scopeColor: string; scopeLabel: string
  open: () => void
  onDragStart: (e: DragEvent) => void
  onCardDrop: (e: DragEvent) => void
  onCardOver: (e: DragEvent) => void
}

// 看板列渲染模型（携带 drop/over/leave 闭包）。
export interface BoardCol {
  key: TaskStatus; name: string; color: string
  count: number; cards: FmtTask[]; hl: boolean
  onDrop: (e: DragEvent) => void
  onOver: (e: DragEvent) => void
  onLeave: () => void
}

// 视图 props（与 AppShell 传入契约一致）。
export interface DatabaseProps {
  workspace: Workspace
  privacy: boolean
  openTask: (id: string) => void
  isMobile?: boolean
}
