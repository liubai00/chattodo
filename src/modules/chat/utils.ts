// 聊天域纯函数：隐私可见性 / 后端行->视图模型映射 / 消息构建 / DOM 滚动 / 错误文案。
// 全部无副作用（scrollMsgs 操作 DOM 但不依赖组件状态），便于复用与回归测试。
import type { Workspace } from '@/shared/enums/workspace'
import { lxFmtDue, lxPad } from '@/shared/utils/format'
import type {
  Scope, TaskLite, IdeaLite, NonLite, RawMsg, RawMsgRow,
  RawTaskRow, RawIdeaRow, RawNonRow,
} from './types'

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

// 隐私模式下只显示当前工作区 + mixed（跨区）内容。
export function visible(scope: Scope, privacy: boolean, workspace: Workspace): boolean {
  return !privacy || scope === workspace || scope === 'mixed'
}

export function projName(pid: string | null | undefined): string {
  return pid ? pid : '收件箱'
}

export function mapTask(t: RawTaskRow): TaskLite {
  return {
    id: t.id, title: t.title, status: t.status,
    project: t.collabFrom ? '协作' : projName(t.projectId),
    due: lxFmtDue(t.dueAt),
    priority: t.priority || 3,
    scope: (t.privacyScope || 'work') as Scope,
    assignee: t.assignee || null,
    collabFrom: t.collabFrom || null,
    today: !!t.today,
  }
}

export function mapIdea(i: RawIdeaRow): IdeaLite {
  return {
    id: i.id, title: i.title,
    reason: i.aiReason || '',
    suggest: i.suggestedNextAction || '',
    scope: (i.privacyScope || 'work') as Scope,
  }
}

export function mapNon(n: RawNonRow): NonLite {
  return {
    id: n.id, title: n.title,
    reason: n.reason || '',
    scope: (n.privacyScope || 'work') as Scope,
  }
}

// 后端 chat 行 -> 渲染消息：插入日期分隔（今天 / M月D日），user / ai 气泡，取最近 60 条。
export function buildMessages(chatRows: RawMsgRow[] | undefined): RawMsg[] {
  const messages: RawMsg[] = []
  let lastDay = ''
  for (const m of (chatRows || []).slice(-60)) {
    const d = m.createdAt ? new Date(m.createdAt) : null
    if (d) {
      const day = `${d.getMonth() + 1}月${d.getDate()}日`
      if (day !== lastDay) {
        lastDay = day
        const t0 = new Date()
        const isToday = d.getFullYear() === t0.getFullYear() && d.getMonth() === t0.getMonth() && d.getDate() === t0.getDate()
        messages.push({ id: 'day_' + m.id, role: 'sys', text: isToday ? '今天' : day })
      }
    }
    const time = d ? `${d.getMonth() + 1}/${d.getDate()} ${lxPad(d.getHours())}:${lxPad(d.getMinutes())}` : ''
    if (m.role === 'user') messages.push({ id: m.id, role: 'user', text: m.text, time, refType: m.refType || null, refId: m.refId || null })
    else messages.push({ id: m.id, role: 'ai', kind: 'text', text: m.text, isErr: !!m.isError, time })
  }
  return messages
}

// 消息区自动滚到底：force=true 强滚；否则仅当用户已在底部附近（180px 内）才跟随。
export function scrollMsgs(force?: boolean): void {
  const b = document.getElementById('lx-msgs')
  if (!b) return
  if (force || b.scrollHeight - b.scrollTop - b.clientHeight < 180) b.scrollTop = b.scrollHeight
}

// 聚焦输入框（发送 / 选提及后恢复焦点）。
export function focusComposer(): void {
  const el = document.getElementById('lx-composer')
  if (el) el.focus()
}
