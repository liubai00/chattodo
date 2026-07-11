// 聊天消息子 composable：消息列表视图模型 + 消息动作（撤销 / 提交计划 / 重试）。
// messageList 给每条消息附 isXxx 标记与动作闭包，模板零 emit 即可调。
// retryMsg 复用 send（由 useChatSend 传入），故 messages 在 send 之后初始化。
import { computed } from 'vue'
import { TasksAPI } from '@/modules/tasks/api'
import { ClarifyAPI } from '@/modules/clarify/api'
import { NonTodoAPI } from '@/modules/nontodo/api'
import { errMsg } from '@/modules/chat/utils'
import type { ChatCtx, MessageItem, RawMsg } from '@/modules/chat/types'

export function useChatMessages(ctx: ChatCtx, send: (forcedText?: string) => Promise<void> | void) {
  const { props, notify, rawMessages, tasks, ideas, nonTodos, feed } = ctx

  function undoEntity(msg: RawMsg): void {
    const kind = msg.kind, refId = msg.refId, title = msg.title || msg.text || ''
    if (!refId) return
    const p = kind === 'task' ? TasksAPI.deleteTask(refId)
      : kind === 'idea' ? ClarifyAPI.ideaDiscard(refId)
        : NonTodoAPI.nonDiscard(refId)
    p.then(() => {
      if (kind === 'task') tasks.value = tasks.value.filter((x) => x.id !== refId)
      if (kind === 'idea') ideas.value = ideas.value.filter((x) => x.id !== refId)
      if (kind === 'nono') nonTodos.value = nonTodos.value.filter((x) => x.id !== refId)
      feed.value = feed.value.filter((f) => f.refId !== refId)
      rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { id: x.id, role: 'sys', text: '已撤销：' + String(title).slice(0, 30) } : x)
      notify('已撤销'); props.afterSend()
    }).catch((e: unknown) => notify('撤销失败：' + errMsg(e)))
  }

  function commitPlan(msg: RawMsg): void {
    if (msg.committed) return
    const items = (msg.plan || []).filter((p) => p.id).map((p) => ({ id: p.id, minutes: p.m || 30 }))
    if (!items.length) { notify('该计划没有可执行的任务'); return }
    TasksAPI.commitPlan(items)
      .then(() => {
        rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { ...x, committed: true } : x)
        notify('已写入执行计划 · 在「今日」视图查看'); props.afterSend()
      })
      .catch((e: unknown) => notify('操作失败：' + errMsg(e)))
  }

  function retryMsg(msg: RawMsg): void {
    rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { ...x, retrying: true } as RawMsg : x)
    Promise.resolve(send(msg.retryText)).finally(() => {
      rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { ...x, retrying: false } as RawMsg : x)
    })
  }

  const messageList = computed<MessageItem[]>(() => rawMessages.value.map((m) => {
    const isSys = m.role === 'sys', isUser = m.role === 'user'
    const isAgentText = m.role === 'ai' && m.kind === 'text', isTask = m.role === 'ai' && m.kind === 'task'
    const isIdea = m.role === 'ai' && m.kind === 'idea', isNono = m.role === 'ai' && m.kind === 'nono'
    const isPlan = m.role === 'ai' && m.kind === 'plan', isError = m.role === 'ai' && m.kind === 'error'
    return {
      ...m, isSys, isUser, isAgentText, isTask, isIdea, isNono, isPlan, isError,
      hasRefs: !!(m.refs && m.refs.length), isErr: !!m.isErr,
      open: () => { if (isTask) props.openTask(m.refId!); else if (isIdea) props.openIdea(m.refId!) },
      openRef: () => { if (m.refType === 'task') props.openTask(m.refId!); else if (m.refType === 'todo_idea') props.openIdea(m.refId!); else if (m.refId) props.openNon(m.refId!) },
      undo: () => undoEntity(m), commitPlan: () => commitPlan(m), retry: () => retryMsg(m),
    }
  }))

  return { messageList, undoEntity, commitPlan, retryMsg }
}
