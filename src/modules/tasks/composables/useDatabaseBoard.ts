// 数据库视图域 composable：表格/看板数据、筛选、排序、批量、拖拽(改状态/重排)、FLIP 动画、首屏加载。
// 视图只组装；本 composable 持有全部状态与编排。FLIP 经 useFlip(@/motion)，boardEl 由视图绑定后回填。
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { AuthAPI } from '@/modules/auth/api'
import { AppAPI } from '@/modules/app/api'
import { TasksAPI } from '@/modules/tasks/api'
import { useFlip } from '@/motion'
import { lxFmtDue } from '@/shared/utils/format'
import type { TaskStatus } from '@/shared/enums/task-status'
import type { DatabaseProps, DbLayout, DbView, TaskItem, FmtTask, BoardCol, DbRawTask, DbState, Scope } from '@/modules/tasks/types'

const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
const PRIO_COLORS: Record<number, [string, string]> = { 1: ['var(--danger)', 'var(--danger-bg)'], 2: ['var(--idea)', 'var(--idea-bg)'], 3: ['var(--text2)', 'var(--mid)'], 4: ['var(--text3)', 'var(--mid)'] }
const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', in_progress: '进行中', done: '已完成' }
export const DB_DEFS: Array<[DbView, string, string]> = [['all', '全部任务', 'ph-stack'], ['today', '今日', 'ph-sun-horizon'], ['open', '未完成', 'ph-circle-dashed'], ['done', '已完成', 'ph-check-circle'], ['collab', '协作任务', 'ph-users']]
const BOARD_DEFS: Array<[TaskStatus, string, string]> = [['todo', '待办', 'var(--text3)'], ['in_progress', '进行中', 'var(--idea)'], ['done', '已完成', 'var(--accent)']]
const DUE_ORDER: Record<string, number> = { '昨天': 0, '今天': 1, '明天': 2, '后天': 3, '周一': 4, '周二': 4, '周三': 4, '周四': 5, '周五': 6, '下周': 8, '月底': 9, '待定': 99 }
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 }

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

  function memberColor(name: string): string {
    if (!name) return 'var(--cat-fallback)'
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
    return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
  }
  function visible(scope: Scope): boolean {
    return !props.privacy || scope === props.workspace || scope === 'mixed'
  }
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
      assignee: t.assignee || null,
      collabFrom: t.collabFrom || null,
    }
  }

  const visTasks = computed(() => tasks.value.filter((t) => visible(t.scope)))
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
  function orderTasks(list: TaskItem[]): TaskItem[] {
    const ord = taskOrder.value
    if (!ord || !ord.length) return list
    const map = new Map(ord.map((id, i) => [id, i]))
    return [...list].sort((a, b) => (map.has(a.id) ? map.get(a.id)! : 1e9) - (map.has(b.id) ? map.get(b.id)! : 1e9))
  }
  const tbl = computed(() => {
    const d = dbase.value
    if (dbView.value === 'today') return d.filter((t) => t.today)
    if (dbView.value === 'open') return d.filter((t) => t.status !== 'done')
    if (dbView.value === 'done') return d.filter((t) => t.status === 'done')
    if (dbView.value === 'collab') return d.filter((t) => t.collabFrom)
    return d
  })
  const sortedTbl = computed(() => {
    const list = tbl.value
    if (dbSortKey.value) {
      const dir = dbSortDir.value === 'asc' ? 1 : -1
      const dOrd = (d: string) => { for (const k in DUE_ORDER) { if (d && d.indexOf(k) >= 0) return DUE_ORDER[k] } return 50 }
      return [...list].sort((a, b) => {
        if (dbSortKey.value === 'title') return dir * a.title.localeCompare(b.title, 'zh')
        if (dbSortKey.value === 'project') return dir * a.project.localeCompare(b.project, 'zh')
        if (dbSortKey.value === 'priority') return dir * (a.priority - b.priority)
        if (dbSortKey.value === 'due') return dir * (dOrd(a.due) - dOrd(b.due))
        if (dbSortKey.value === 'status') return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
        return 0
      })
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

  function fmtTask(t: TaskItem): FmtTask {
    const done = t.status === 'done'
    const selected = dbSelected.value.includes(t.id)
    const asg = t.assignee || myName.value || '我'
    const pc = PRIO_COLORS[t.priority] || PRIO_COLORS[3]
    const statusLabel = t.collabFrom ? STATUS_LABEL[t.status] + ' · 来自 ' + t.collabFrom : STATUS_LABEL[t.status]
    return {
      id: t.id, title: t.title, project: t.project, due: t.due, statusLabel, collabFrom: t.collabFrom,
      selected, rowBg: selected ? 'var(--accent-bg)' : 'transparent',
      selBoxStyle: 'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;' + (selected ? 'background:var(--accent);border:1px solid var(--accent);' : 'border:1.5px solid var(--line2);background:var(--panel);'),
      selCheck: selected ? '' : 'display:none;',
      toggleSel: (e: Event) => { if (e && e.stopPropagation) e.stopPropagation(); toggleSelect(t.id) },
      titleColor: done ? 'var(--text3)' : 'var(--text)',
      titleDeco: done ? 'text-decoration:line-through;' : '',
      dueColor: (t.due === '今天 17:00' || t.due === '明天' || t.today) ? 'var(--accent-ink)' : 'var(--text2)',
      prio: 'P' + t.priority,
      prioStyle: 'display:inline-flex;padding:3px 8px;border-radius:6px;font:700 11px/1 var(--font);color:' + pc[0] + ';background:' + pc[1] + ';',
      assignee: asg, assigneeInitial: asg.slice(-1), assigneeColor: memberColor(asg),
      scopeColor: t.scope === 'work' ? 'var(--accent)' : 'var(--idea)',
      scopeLabel: t.scope === 'work' ? '工作' : '个人',
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
  async function flipBoard(mutate: () => void): Promise<void> {
    const { Flip } = await useFlip()
    const root = boardEl.value
    const cards = root ? Array.from(root.querySelectorAll<HTMLElement>('div[draggable="true"]')) : []
    const state = Flip && cards.length ? Flip.getState(cards) : null
    mutate()
    if (state && Flip) {
      await nextTick()
      try { Flip.from(state, { duration: 0.35, ease: 'power3.out', absoluteOnLeave: true }) } catch (e) { console.error('[lx] flip.from:', e) }
    }
  }
  async function _dropOnCard(targetId: string): Promise<void> {
    const drag = _dragId; _dragId = null
    if (!drag || drag === targetId) return
    const dragT = tasks.value.find((x) => x.id === drag), tgtT = tasks.value.find((x) => x.id === targetId)
    await flipBoard(() => {
      if (dragT && tgtT && dragT.status !== tgtT.status) patchTask(drag, { status: tgtT.status })
      _moveInOrder(drag, targetId)
    })
  }
  async function _dropOnCol(status: TaskStatus): Promise<void> {
    const drag = _dragId; _dragId = null
    if (!drag) return
    const dragT = tasks.value.find((x) => x.id === drag)
    await flipBoard(() => {
      dragOverCol.value = null
      if (dragT && dragT.status !== status) patchTask(drag, { status })
      _moveInOrder(drag, null)
    })
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
  }
}
