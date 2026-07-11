// 聊天会话子 composable：会话列表 load / switch / new / delete。
// 共享 ctx 中的 conversations / activeConversationId / rawMessages / showList；
// 删除当前会话且无剩余时回调 reload（由门面 load 重新拉首屏）。
import { computed, nextTick } from 'vue'
import { ChatAPI } from '@/modules/chat/api'
import { lxFmtDue } from '@/shared/utils/format'
import { buildMessages, scrollMsgs, errMsg } from '@/modules/chat/utils'
import type { ChatCtx, ConversationItem, RawMsgRow } from '@/modules/chat/types'

// conversationMessages 实际返回 { chat: RawMsgRow[] }（API 类型签名偏松，按真实形状收窄）。
type ConversationMessagesResp = { chat?: RawMsgRow[] }

export function useChatConversations(ctx: ChatCtx, reload: () => void) {
  const { props, notify, conversations, activeConversationId, rawMessages, showList } = ctx

  function loadConversations(): void {
    ChatAPI.conversations()
      .then((r) => { conversations.value = r.conversations || [] })
      .catch(() => { /* ignore */ })
  }

  function newConversation(): void {
    ChatAPI.createConversation()
      .then((c) => {
        conversations.value = [c, ...conversations.value]
        activeConversationId.value = c.id
        rawMessages.value = []
        if (props.isMobile) showList.value = false
      })
      .catch((e: unknown) => notify('新建失败：' + errMsg(e)))
  }

  function switchConversation(id: string): void {
    activeConversationId.value = id
    if (props.isMobile) showList.value = false
    ChatAPI.conversationMessages(id)
      .then((r) => {
        rawMessages.value = buildMessages((r as unknown as ConversationMessagesResp).chat)
        nextTick(scrollMsgs)
      })
      .catch(() => { /* ignore */ })
  }

  function deleteConversationUi(id: string): void {
    const wasActive = activeConversationId.value === id
    ChatAPI.deleteConversation(id)
      .then(() => {
        const rest = conversations.value.filter((c) => c.id !== id)
        conversations.value = rest
        if (wasActive) {
          if (rest.length) switchConversation(rest[0].id)
          else reload()
        }
        notify('已删除对话')
      })
      .catch((e: unknown) => notify('删除失败：' + errMsg(e)))
  }

  const conversationList = computed<ConversationItem[]>(() =>
    conversations.value.map((c) => ({
      id: c.id,
      title: c.title || '新对话',
      preview: (c.lastText || '还没有消息').replace(/\s+/g, ' ').slice(0, 30),
      time: lxFmtDue(c.updatedAt),
      active: c.id === activeConversationId.value,
      open: () => switchConversation(c.id),
      remove: () => deleteConversationUi(c.id),
    })),
  )

  return { conversationList, loadConversations, newConversation, switchConversation, deleteConversationUi }
}
