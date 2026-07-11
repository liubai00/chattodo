// 聊天 feed + 今日待办胶囊子 composable。
// feed：收集箱列表（搜索过滤 + 点击跳实体）；today：胶囊徽标 + 下拉加载今日待办。
import { ref, computed } from 'vue'
import { TasksAPI } from '@/modules/tasks/api'
import { lxFmtDue } from '@/shared/utils/format'
import { errMsg } from '@/modules/chat/utils'
import type { ChatCtx, FeedListItem, TodayListItem, TodayRow } from '@/modules/chat/types'

const FEED_LABEL: Record<string, string> = { task: '任务', idea: '待澄清', nono: '非 todo' }
const FEED_DOT: Record<string, string> = { task: 'var(--accent)', idea: 'var(--idea)', nono: 'var(--text3)' }

// listTasks 真实可能返回数组或 { tasks: [] }，按运行时形状收窄。
type ListTasksResp = TodayRow[] | { tasks?: TodayRow[] }

export function useChatFeed(ctx: ChatCtx) {
  const { props, notify, feed, tasks, ideas, nonTodos } = ctx

  const feedQuery = ref('')

  function openEntity(kind: string, id: string): void {
    if (kind === 'task') {
      if (tasks.value.some((t) => t.id === id)) props.openTask(id)
      else notify('该任务已被删除或移出')
    } else if (kind === 'idea') {
      if (ideas.value.some((i) => i.id === id)) props.openIdea(id)
      else notify('该想法已被处理')
    } else {
      if (nonTodos.value.some((n) => n.id === id)) props.openNon(id)
      else notify('该记录已被处理')
    }
  }

  const feedList = computed<FeedListItem[]>(() => {
    const q = feedQuery.value.toLowerCase()
    return feed.value
      .filter((f) => !q || f.title.toLowerCase().includes(q))
      .map((f) => ({
        ...f,
        label: FEED_LABEL[f.kind] || '',
        dot: FEED_DOT[f.kind] || 'var(--text3)',
        textColor: f.kind === 'nono' ? 'var(--text2)' : 'var(--text)',
        open: () => openEntity(f.kind, f.refId),
      }))
  })
  const feedCount = computed(() => feed.value.length)
  const feedEmpty = computed(() => feed.value.length === 0)

  // ---- 今日待办胶囊 ----
  const todayOpen = ref(false)
  const todayLoading = ref(false)
  const todayError = ref('')
  const todayItems = ref<TodayRow[]>([])

  const todayCount = computed(() => tasks.value.filter((t) => t.today && t.status !== 'done').length)
  const todaySubtitle = computed(() =>
    todayLoading.value ? '加载中…' : todayError.value ? '加载失败' : `${todayItems.value.filter((t) => t.status !== 'done').length} 条未完成`,
  )
  const todayPillStyle = computed(() =>
    'display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:16px;font:600 12px/1 var(--font);cursor:pointer;' +
    (todayOpen.value ? 'border:1px solid var(--accent);background:var(--accent-bg);color:var(--accent-ink);' : 'border:1px solid var(--line2);background:var(--panel);color:var(--text2);'),
  )

  function todayProgress(t: TodayRow): string {
    const sl = ({ todo: '待办', in_progress: '进行中', done: '已完成' } as Record<string, string>)[t.status] || '待办'
    const when = t.dueAt ? '截止 ' + lxFmtDue(t.dueAt) : t.plannedAt ? '计划 ' + lxFmtDue(t.plannedAt) : '未排期'
    const parts = [sl, when, 'P' + (t.priority || 3)]
    if (t.collabFrom) parts.unshift('协作·来自' + t.collabFrom)
    return parts.join(' · ')
  }

  const todayList = computed<TodayListItem[]>(() =>
    todayItems.value.map((t) => ({
      title: t.title,
      progress: todayProgress(t),
      done: t.status === 'done',
      dot: t.status === 'done' ? 'var(--text3)' : t.status === 'in_progress' ? 'var(--idea)' : 'var(--accent)',
      open: () => { todayOpen.value = false; props.openTask(t.id) },
    })),
  )

  function loadToday(): void {
    todayLoading.value = true
    todayError.value = ''
    const rank = (t: TodayRow): number => {
      const m: Record<string, number> = { in_progress: 0, todo: 1, done: 2 }
      return m[t.status] != null ? m[t.status] : 1
    }
    TasksAPI.listTasks({ view: 'today' })
      .then((list) => {
        const raw = list as unknown as ListTasksResp
        const arr: TodayRow[] = Array.isArray(raw) ? raw : (raw.tasks || [])
        const items = arr
          .filter((t) => t.status !== 'archived')
          .sort((a, b) => rank(a) - rank(b) || (String(a.dueAt || a.plannedAt || '9999') < String(b.dueAt || b.plannedAt || '9999') ? -1 : 1))
        todayItems.value = items
        todayLoading.value = false
      })
      .catch((e: unknown) => {
        todayLoading.value = false
        todayError.value = errMsg(e) || '加载失败，请重试'
      })
  }

  function toggleTodayPanel(): void {
    todayOpen.value = !todayOpen.value
    if (todayOpen.value) loadToday()
  }
  function closeTodayPanel(): void { todayOpen.value = false }
  function refreshToday(): void { loadToday() }

  return {
    feedQuery, feedList, feedCount, feedEmpty,
    todayOpen, todayLoading, todayError, todayItems, todayCount, todaySubtitle, todayPillStyle, todayList,
    toggleTodayPanel, closeTodayPanel, refreshToday, loadToday,
  }
}
