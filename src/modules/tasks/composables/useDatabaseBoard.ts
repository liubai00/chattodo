// 数据库视图域 composable：表格/看板数据、筛选、排序、批量、拖拽(改状态/重排)、FLIP 动画、首屏加载。
// 视图只组装；本 composable 持有全部状态与编排。FLIP 经 useFlip(@/motion)，boardEl 由视图绑定后回填。
// P13 Phase 1: 策略化 — 筛选/排序/展示 拆入 ../strategies，flipBoard 选择器改 [data-kanban-card]。
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { AuthAPI } from '@/modules/auth/api'
import { AppAPI } from '@/modules/app/api'
import { TasksAPI } from '@/modules/tasks/api'
import { useFlip } from '@/motion'
import { lxFmtDue } from '@/shared/utils/format'
import { VIEW_FILTERS, SORT_COMPARATORS } from '@/modules/tasks/strategies'
import {
  memberColor, visible, fmtTitleColor, fmtTitleDeco, fmtDueColor, fmtPrioStyle,
  fmtStatusLabel, fmtScopeColor, fmtScopeLabel,
} from '@/modules/tasks/strategies'
import type { TaskStatus } from '@/shared/enums/task-status'
import type { DatabaseProps, DbLayout, DbView, TaskItem, FmtTask, BoardCol, DbRawTask, DbState, Scope } from '@/modules/tasks/types'

export const DB_DEFS: Array<[DbView, string, string]> = [['all', '全部任务', 'ph-stack'], ['today', '今日', 'ph-sun-horizon'], ['open', '未完成', 'ph-circle-dashed'], ['done', '已完成', 'ph-check-circle'], ['collab', '协作任务', 'ph-users']]
const BOARD_DEFS: Array<[TaskStatus, string, string]> = [['todo', '待办', 'var(--text3)'], ['in_progress', '进行中', 'var(--idea)'], ['done', '已完成', 'var(--accent)']]

export function useDatabaseBoard(props: DatabaseProps, notify: (m: string) => void) {
  const router = useRouter()

  const loading = ref(true)
  const myName = ref('')
  const canEdit = ref(false)
  const tasks = ref<TaskItem[]>([])
  const dbView = ref<DbView>('all')
  const dbLayout = ref<DbLayout>('table')
  const dbSearch = ref('')
  const dbProject = ref('all')
  const dbPriority = ref('all')
  const dbSortKey = ref('')
  const dbSortDir = ref<'asc' | 'desc'>('asc')
  const dbSelected = ref<string[]>([])
  const taskOrder = ref<string[]>([])
  const dragOverCol = ref<TaskStatus | null>(null)
  const boardEl = ref<HTMLElement | null>(null)
  let _dragId: string | null = null

  function isToday(iso: string): boolean {
    if (!iso) return false
    const d = new Date(iso), t = new Date()
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  }
  function mapTask(t: DbRawTask): TaskItem {
    return {
      id: t.id, title: t.title, status: t.status,
      project: t.collabFrom ? '协作' : (t.project || '收件箱'),
      due: lxFmtDue(t.dueAt),
      today: !!t.today || !!(t.dueAt && isToday(t.dueAt)),
      priority: t.priority || 3,
      scope: (t.privacyScope || 'work') as Scope,
      assignee: t.assignee || null, collabFrom: t.collabFrom || null,
    }
  }

  const visTasks = computed(() => tasks.value.filter((t) => visible(t.scope, props.privacy, props.workspace)))
  const counts = computed(() => ({
    all: visTasks.value.length,
    today: visTasks.value.filter((t) => t.today).length,
    open: visTasks.value.filter((t) => t.status !== 'done').length,
    done: visTasks.value.filter((t) => t.status === 'done').length,
    collab: visTasks.value.filter((t) => t.collabFrom).length,
  }))
  const dbViewName = computed(() => ({ all: '全部任务', today: '今日', open: '未完成', done: '已完成', collab: '协作任务' } as Record<DbView, string>)[dbView.value])
  const dbase = computed(() => {
    let d = visTasks.value
    if (dbProject.value !== 'all') d = d.filter((t) => t.project === dbProject.value)
    if (dbPriority.value !== 'all') d = d.filter((t) => t.priority === Number(dbPriority.value))
    const dq = dbSearch.value.toLowerCase()
    if (dq) d = d.filter((t) => t.title.toLowerCase().includes(dq))
    return d
  })

  // P13 Phase 1: tbl 经 VIEW_FILTERS registry（替代 if-else 链）
  const tbl = computed(() => dbase.value.filter(VIEW_FILTERS[dbView.value]))

  function orderTasks(list: TaskItem[]): TaskItem[] {
    const ord = taskOrder.value
    if (!ord || !ord.length) return list
    const map = new Map(ord.map((id, i) => [id, i]))
    return [...list].sort((a, b) => (map.has(a.id) ? map.get(a.id)! : 1e9) - (map.has(b.id) ? map.get(b.id)! : 1e9))
  }

  // P13 Phase 1: sortedTbl 经 SORT_COMPARATORS registry（替代 if-else 链）
  const sortedTbl = computed(() => {
    const list = tbl.value
    if (dbSortKey.value && SORT_COMPARATORS[dbSortKey.value]) {
      const dir = dbSortDir.value === 'asc' ? 1 : -1
      return [...list].sort((a, b) => SORT_COMPARATORS[dbSortKey.value](a, b, dir))
    }
    return orderTasks(list)
  })

  const filteredTasks = computed(() => sortedTbl.value.map(fmtTask))
  const boardCols = computed<BoardCol[]>(() => BOARD_DEFS.map(([key, name, color]) => ({
    key, name, color,
    count: dbase.value.filter((t) => t.status === key).length,
    cards: orderTasks(dbase.value.filter((t) => t.status === key)).map(fmtTask),
    hl: dragOverCol.value === key,
    onDrop: (e: DragEvent) => { if (e && e.preventDefault) e.preventDefault(); _dropOnCol(key) },
    onOver: (e: DragEvent) => { if (e && e.preventDefault) e.preventDefault(); if (dragOverCol.value !== key) dragOverCol.value = key },
    onLeave: () => { if (dragOverCol.value === key) dragOverCol.value = null },
  })))
  const projectOptions = computed(() => [{ value: 'all', label: '全部项目' }].concat([...new Set(tasks.value.map((t) => t.project))].map((p) => ({ value: p, label: p }))))
  const priorityOptions = [{ value: 'all', label: '全部优先级' }, { value: '1', label: 'P1 紧急' }, { value: '2', label: 'P2 高' }, { value: '3', label: 'P3 中' }, { value: '4', label: 'P4 低' }]
  const selIds = computed(() => filteredTasks.value.map((t) => t.id))
  const allSelected = computed(() => selIds.value.length > 0 && selIds.value.every((id) => dbSelected.value.includes(id)))
  const modeLabel = computed(() => (props.workspace === 'work' ? '工作' : '个人') + (props.privacy ? ' · 隐私' : ''))
  const modeIcon = computed(() => (props.privacy ? 'ph-lock-simple' : 'ph-briefcase'))

  // P13 Phase 1: fmtTask 展示映射调 strategies 纯函数（替代内联计算）
  function fmtTask(t: TaskItem): FmtTask {
    const done = t.status === 'done'
    const selected = dbSelected.value.includes(t.id)
    const asg = t.assignee || myName.value || '我'
    return {
      id: t.id, title: t.title, project: t.project, due: t.due,
      statusLabel: fmtStatusLabel(t.status, t.collabFrom), collabFrom: t.collabFrom,
      selected, rowBg: selected ? 'var(--accent-bg)' : 'transparent',
      selBoxStyle: 'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;' + (selected ? 'background:var(--accent);border:1px solid var(--accent);' : 'border:1.5px solid var(--line2);background:var(--panel);'),
      selCheck: selected ? '' : 'display:none;',
      toggleSel: (e: Event) => { if (e && e.stopPropagation) e.stopPropagation(); toggleSelect(t.id) },
      titleColor: fmtTitleColor(done),
      titleDeco: fmtTitleDeco(done),
      dueColor: fmtDueColor(t.due, t.today),
      prio: 'P' + t.priority,
      prioStyle: fmtPrioStyle(t.priority),
      assignee: asg, assigneeInitial: asg.slice(-1), assigneeColor: memberColor(asg),
      scopeColor: fmtScopeColor(t.scope),
      scopeLabel: fmtScopeLabel(t.scope),
      open: () => props.openTask(t.id),
      onDragStart: (e: DragEvent) => { _dragId = t.id; try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) } } catch { /* ignore */ } },
      onCardDrop: (e: DragEvent) => { if (e) { e.preventDefault(); e.stopPropagation() } _dropOnCard(t.id) },
      onCardOver: (e: DragEvent) => { if (e) e.preventDefault() },
    }
  }

  // ---- 拖拽 / 排序 / 批量 ----
  function _saveOrder(order: string[]): void { try { localStorage.setItem('lx_task_order', JSON.stringify(order)) } catch { /* ignore */ } }
  function _moveInOrder(dragId: string, beforeId: string | null): void {
    let order = (taskOrder.value || []).slice()
    const allIds = tasks.value.map((t) => t.id)
    for (const id of allIds) if (!order.includes(id)) order.push(id)
    order = order.filter((id) => allIds.includes(id) && id !== dragId)
    if (beforeId) { const i = order.indexOf(beforeId); order.splice(i < 0 ? order.length : i, 0, dragId) } else order.push(dragId)
    taskOrder.value = order; dragOverCol.value = null; _saveOrder(order)
  }

  // GSAP FLIP：记录卡片旧位置 -> 改状态/顺序让 Vue 重排 -> Flip.from 平滑滑到新位置。
  // P13 Phase 1: 选择器从 div[draggable="true"] 改为 [data-kanban-card]（统一 GSAP Draggable 契约）。
  async function flipBoard(mutate: () => void): Promise<void> {
    const { Flip } = await useFlip()
    const root = boardEl.value
    const cards = root ? Array.from(root.querySelectorAll<HTMLElement>('[data-kanban-card]')) : []
    const state = Flip && cards.length ? Flip.getState(cards) : null
    mutate()
    if (state && Flip) {
      await nextTick()
      try { Flip.from(state, { duration: 0.35, ease: 'power3.out', absoluteOnLeave: true }) } catch (e) { console.error('[lx] flip.from:', e) }
    }
  }

  // P13 Phase 1: 拖拽回调公开导出（供 DatabaseView→useKanbanDraggable 接线）
  function setDragId(id: string | null): void { _dragId = id }

  async function handleDropOnCard(dragId: string, targetId: string): Promise<void> {
    const dragT = tasks.value.find((x) => x.id === dragId), tgtT = tasks.value.find((x) => x.id === targetId)
    await flipBoard(() => {
      if (dragT && tgtT && dragT.status !== tgtT.status) patchTask(dragId, { status: tgtT.status })
      _moveInOrder(dragId, targetId)
    })
  }

  async function handleDropOnCol(dragId: string, status: TaskStatus): Promise<void> {
    const dragT = tasks.value.find((x) => x.id === dragId)
    await flipBoard(() => {
      dragOverCol.value = null
      if (dragT && dragT.status !== status) patchTask(dragId, { status })
      _moveInOrder(dragId, null)
    })
  }

  // 内部回退（HTML5 drag 仍走这个路径，BoardCol.onDrop 闭包保留）
  async function _dropOnCard(targetId: string): Promise<void> {
    const drag = _dragId; _dragId = null
    if (!drag || drag === targetId) return
    await handleDropOnCard(drag, targetId)
  }
  async function _dropOnCol(status: TaskStatus): Promise<void> {
    const drag = _dragId; _dragId = null
    if (!drag) return
    await handleDropOnCol(drag, status)
  }

  function patchTask(id: string, patch: { status?: TaskStatus }): void {
    tasks.value = tasks.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
    const body: Record<string, unknown> = {}
    if (patch.status !== undefined) body.status = patch.status
    if (Object.keys(body).length) TasksAPI.updateTask(id, body).catch(() => {})
  }
  function toggleSelect(id: string): void { dbSelected.value = dbSelected.value.includes(id) ? dbSelected.value.filter((x) => x !== id) : [...dbSelected.value, id] }
  function selectAll(): void { const ids = selIds.value; dbSelected.value = (ids.length > 0 && ids.every((i) => dbSelected.value.includes(i))) ? [] : ids.slice() }
  function batchStatus(status: TaskStatus): void {
    const ids = dbSelected.value.slice()
    tasks.value = tasks.value.map((t) => (ids.includes(t.id) ? { ...t, status } : t))
    dbSelected.value = []
    ids.forEach((id) => TasksAPI.updateTask(id, { status }).catch(() => {}))
    notify('已更新 ' + ids.length + ' 项状态')
  }
  function batchPriority(p: number): void {
    const ids = dbSelected.value.slice()
    tasks.value = tasks.value.map((t) => (ids.includes(t.id) ? { ...t, priority: p } : t))
    dbSelected.value = []
    ids.forEach((id) => TasksAPI.updateTask(id, { priority: p }).catch(() => {}))
    notify('已设为 P' + p)
  }
  function batchMoveOut(): void {
    const ids = dbSelected.value.slice()
    tasks.value = tasks.value.filter((t) => !ids.includes(t.id))
    dbSelected.value = []
    ids.forEach((id) => TasksAPI.taskMoveOut(id).catch(() => {}))
    notify('已移出 ' + ids.length + ' 项 · 保留来源')
  }
  function batchDelete(): void {
    const ids = dbSelected.value.slice()
    tasks.value = tasks.value.filter((t) => !ids.includes(t.id))
    dbSelected.value = []
    ids.forEach((id) => TasksAPI.deleteTask(id).catch(() => {}))
    notify('已删除 ' + ids.length + ' 项')
  }
  function toggleSort(key: string): void { dbSortKey.value = key; dbSortDir.value = (dbSortKey.value === key && dbSortDir.value === 'asc') ? 'desc' : 'asc' }
  function newCapture(): void { router.push({ name: 'chat' }); setTimeout(() => { const c = document.getElementById('lx-composer'); if (c) c.focus() }, 80) }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const [me, st] = await Promise.all([AuthAPI.me(), AppAPI.getState()])
      myName.value = me.name || ''
      canEdit.value = (me.role || 'member') !== 'viewer'
      const s = st as DbState
      tasks.value = (s.tasks || []).map(mapTask)
      try { const o = JSON.parse(localStorage.getItem('lx_task_order') || '[]'); if (Array.isArray(o)) taskOrder.value = o } catch { /* ignore */ }
    } catch {
      notify('加载任务失败，请刷新重试')
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  return {
    loading, canEdit, myName, tasks, modeLabel, modeIcon,
    dbView, dbLayout, dbSearch, dbProject, dbPriority, dbSortKey, dbSortDir, dbSelected,
    counts, dbViewName, filteredTasks, boardCols, projectOptions, priorityOptions,
    allSelected, boardEl, DB_DEFS,
    toggleSort, selectAll, batchStatus, batchPriority, batchMoveOut, batchDelete, newCapture,
    // P13 Phase 1: 公开拖拽回调 + dragId 管理（供 useKanbanDraggable 接线）
    handleDropOnCard, handleDropOnCol, setDragId,
  }
}
