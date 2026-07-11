// 聊天门面 composable：创建共享 ctx，编排四个子 composable（conversations / send / messages / feed），
// 暴露视图与组件所需的单一 API。load() 拉首屏（me + getState + team），子 composable 间经 ctx 共享同一份 ref。
import { ref, onMounted, nextTick } from 'vue'
import { AuthAPI } from '@/modules/auth/api'
import { AppAPI } from '@/modules/app/api'
import { TasksAPI } from '@/modules/tasks/api'
import { lxFmtDue } from '@/shared/utils/format'
import { useViewCache } from '@/shared/composables/useViewCache'
import { buildMessages, scrollMsgs, mapTask, mapIdea, mapNon } from '@/modules/chat/utils'
import { useChatConversations } from './useChatConversations'
import { useChatFeed } from './useChatFeed'
import { useChatSend } from './useChatSend'
import { useChatMessages } from './useChatMessages'
import type {
  ChatCtx, ChatProps, RawMsg, TaskLite, IdeaLite, NonLite, FeedItem, ChatState, ChatConversation,
} from '@/modules/chat/types'
import type { TeamUser } from '@/types/api'

export function useChat(props: ChatProps, notify: (m: string) => void) {
  const rawMessages = ref<RawMsg[]>([])
  const tasks = ref<TaskLite[]>([])
  const ideas = ref<IdeaLite[]>([])
  const nonTodos = ref<NonLite[]>([])
  const feed = ref<FeedItem[]>([])
  const activeConversationId = ref<string | null>(null)
  const conversations = ref<ChatConversation[]>([])
  const myName = ref('')
  const team = ref<TeamUser[]>([])
  const canEdit = ref(false)
  const showList = ref(false)
  const loading = ref(true)

  const ctx: ChatCtx = {
    props, notify, rawMessages, tasks, ideas, nonTodos, feed,
    activeConversationId, conversations, myName, team, canEdit, showList,
  }

  async function load(): Promise<void> {
    const cache = useViewCache()
    // H4: Skip full load if we have fresh cached chat state (30s TTL)
    const cached = cache.get<{ conversations: ChatConversation[]; activeConversationId: string | null; rawMessages: RawMsg[] }>('chat')
    if (cached && cached.conversations.length > 0) {
      conversations.value = cached.conversations
      activeConversationId.value = cached.activeConversationId
      rawMessages.value = cached.rawMessages
      loading.value = false
      refreshInBackground()
      return
    }
    loading.value = true
    try {
      const [me, st, tm] = await Promise.all([AuthAPI.me(), AppAPI.getState(), TasksAPI.team()])
      myName.value = me.name || ''
      canEdit.value = (me.role || 'member') !== 'viewer'
      const s = st as ChatState
      tasks.value = (s.tasks || []).map(mapTask)
      ideas.value = (s.todoIdeas || []).filter((i) => i.status === 'clarifying').map(mapIdea)
      nonTodos.value = (s.nonTodoOutputs || []).map(mapNon)
      conversations.value = s.conversations || []
      activeConversationId.value = s.activeConversationId || null
      if (props.isMobile) showList.value = !activeConversationId.value
      rawMessages.value = buildMessages(s.chat)
      team.value = tm.users || []
      const fd: FeedItem[] = []
      ;(s.tasks || []).slice(0, 5).forEach((t) => fd.push({ id: t.id, kind: 'task', title: t.title, time: lxFmtDue(t.createdAt), refId: t.id }))
      ;(s.todoIdeas || []).slice(0, 3).forEach((i) => fd.push({ id: i.id, kind: 'idea', title: i.title, time: lxFmtDue(i.createdAt), refId: i.id }))
      ;(s.nonTodoOutputs || []).slice(0, 3).forEach((n) => fd.push({ id: n.id, kind: 'nono', title: n.title, time: lxFmtDue(n.createdAt), refId: n.id }))
      feed.value = fd
      cache.set('chat', { conversations: conversations.value, activeConversationId: activeConversationId.value, rawMessages: rawMessages.value })
    } catch {
      notify('加载聊天失败，请刷新重试')
    } finally {
      loading.value = false
      nextTick(() => scrollMsgs(true))
    }
  }
  async function refreshInBackground(): Promise<void> {
    try {
      const [me, st, tm] = await Promise.all([AuthAPI.me(), AppAPI.getState(), TasksAPI.team()])
      const cache = useViewCache()
      const s = st as ChatState
      myName.value = me.name || ''
      canEdit.value = (me.role || 'member') !== 'viewer'
      tasks.value = (s.tasks || []).map(mapTask)
      ideas.value = (s.todoIdeas || []).filter((i) => i.status === 'clarifying').map(mapIdea)
      nonTodos.value = (s.nonTodoOutputs || []).map(mapNon)
      conversations.value = s.conversations || []
      rawMessages.value = buildMessages(s.chat)
      team.value = tm.users || []
      cache.set('chat', { conversations: conversations.value, activeConversationId: activeConversationId.value, rawMessages: rawMessages.value })
    } catch { /* silent — stale data is already rendered */ }
  }

  // 顺序：conversations（deleteConversationUi 需要 reload）-> send（需要 loadConversations）
  // -> messages（retryMsg 需要 send）-> feed（独立）。
  const conversations$ = useChatConversations(ctx, load)
  const send$ = useChatSend(ctx, conversations$.loadConversations)
  const messages$ = useChatMessages(ctx, send$.send)
  const feed$ = useChatFeed(ctx)

  onMounted(load)

  return {
    loading, canEdit, showList, myName,
    ...conversations$, ...send$, ...messages$, ...feed$,
  }
}
