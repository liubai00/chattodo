<script setup lang="ts">
// P3 第七个迁移视图：Todo 数据库（列表部分）。自包含，挂载取 me+getState+localStorage(taskOrder)。
// workspace/privacy 经 prop(visible 过滤+modeChip)；openTask 经稳定回调(点击任务->旧 App 详情浮层)。
// 2 列：dbViews 导航 | 头+筛选+批量+table+kanban。拖拽(kanban 改状态/重排)、批量、排序、筛选。
// 详情面板(子任务/评论/动态/协作)保持 legacy(全局浮层)，本视图只管列表。FLIP 动画已补回(flipBoard + data-flip-id)。
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue } from '@/lib/format'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/business/ViewHeader.vue'
import LoadingState from '@/components/business/LoadingState.vue'
import { useFlip } from '@/motion'
import { usePane } from '@/app/composables/usePane'

type Workspace = 'work' | 'personal'
type Scope = Workspace | 'mixed'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type DbView = 'all' | 'today' | 'open' | 'done' | 'collab'
type DbLayout = 'table' | 'board'

interface TaskItem { id: string; title: string; status: TaskStatus; project: string; due: string; today: boolean; priority: number; scope: Scope; assignee: string | null; collabFrom: string | null }

const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
const PRIO_COLORS: Record<number, [string, string]> = { 1: ['var(--danger)', 'var(--danger-bg)'], 2: ['var(--idea)', 'var(--idea-bg)'], 3: ['var(--text2)', 'var(--mid)'], 4: ['var(--text3)', 'var(--mid)'] }
const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', in_progress: '进行中', done: '已完成' }
const DB_DEFS: Array<[DbView, string, string]> = [['all', '全部任务', 'ph-stack'], ['today', '今日', 'ph-sun-horizon'], ['open', '未完成', 'ph-circle-dashed'], ['done', '已完成', 'ph-check-circle'], ['collab', '协作任务', 'ph-users']]
const BOARD_DEFS: Array<[TaskStatus, string, string]> = [['todo', '待办', 'var(--text3)'], ['in_progress', '进行中', 'var(--idea)'], ['done', '已完成', 'var(--accent)']]
const DUE_ORDER: Record<string, number> = { '昨天': 0, '今天': 1, '明天': 2, '后天': 3, '周一': 4, '周二': 4, '周三': 4, '周四': 5, '周五': 6, '下周': 8, '月底': 9, '待定': 99 }
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 }

const props = defineProps<{ workspace: Workspace; privacy: boolean; openTask: (id: string) => void; isMobile?: boolean }>()
const router = useRouter()
const toast = useToast()
const { width: dbNavW, startResize } = usePane({ key: 'lx_pane_db', def: 200, min: 160, max: 360 })

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
let _dragId: string | null = null
const boardEl = ref<HTMLElement | null>(null)

function memberColor(name: string): string {
  if (!name) return 'var(--cat-fallback)'
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}
function visible(scope: Scope): boolean {
  return !props.privacy || scope === props.workspace || scope === 'mixed'
}
function mapTask(t: any): TaskItem {
  return { id: t.id, title: t.title, status: t.status as TaskStatus, project: t.collabFrom ? '协作' : (t.project || '收件箱'), due: lxFmtDue(t.dueAt), today: !!t.today || !!(t.dueAt && isToday(t.dueAt)), priority: t.priority || 3, scope: (t.privacyScope || 'work') as Scope, assignee: t.assignee || null, collabFrom: t.collabFrom || null }
}
function isToday(iso: string): boolean {
  if (!iso) return false
  const d = new Date(iso), t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
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
const boardCols = computed(() => BOARD_DEFS.map(([key, name, color]) => ({
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

interface FmtTask { id: string; title: string; project: string; due: string; statusLabel: string; collabFrom: string | null; selected: boolean; rowBg: string; selBoxStyle: string; selCheck: string; toggleSel: (e: Event) => void; titleColor: string; titleDeco: string; dueColor: string; prio: string; prioStyle: string; assignee: string; assigneeInitial: string; assigneeColor: string; scopeColor: string; scopeLabel: string; open: () => void; onDragStart: (e: DragEvent) => void; onCardDrop: (e: DragEvent) => void; onCardOver: (e: DragEvent) => void }
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
    toggleSel: (e) => { if (e && e.stopPropagation) e.stopPropagation(); toggleSelect(t.id) },
    titleColor: done ? 'var(--text3)' : 'var(--text)',
    titleDeco: done ? 'text-decoration:line-through;' : '',
    dueColor: (t.due === '今天 17:00' || t.due === '明天' || t.today) ? 'var(--accent-ink)' : 'var(--text2)',
    prio: 'P' + t.priority,
    prioStyle: 'display:inline-flex;padding:3px 8px;border-radius:6px;font:700 11px/1 var(--font);color:' + pc[0] + ';background:' + pc[1] + ';',
    assignee: asg, assigneeInitial: asg.slice(-1), assigneeColor: memberColor(asg),
    scopeColor: t.scope === 'work' ? 'var(--accent)' : 'var(--idea)',
    scopeLabel: t.scope === 'work' ? '工作' : '个人',
    open: () => props.openTask(t.id),
    onDragStart: (e) => { _dragId = t.id; try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) } } catch { /* ignore */ } },
    onCardDrop: (e) => { if (e) { e.preventDefault(); e.stopPropagation() } _dropOnCard(t.id) },
    onCardOver: (e) => { if (e) e.preventDefault() },
  }
}

// ---- 拖拽 / 排序 / 批量 ----
function _saveOrder(order: string[]) { try { localStorage.setItem('lx_task_order', JSON.stringify(order)) } catch { /* ignore */ } }
function _moveInOrder(dragId: string, beforeId: string | null) {
  let order = (taskOrder.value || []).slice()
  const allIds = tasks.value.map((t) => t.id)
  for (const id of allIds) if (!order.includes(id)) order.push(id)
  order = order.filter((id) => allIds.includes(id) && id !== dragId)
  if (beforeId) { const i = order.indexOf(beforeId); order.splice(i < 0 ? order.length : i, 0, dragId) } else order.push(dragId)
  taskOrder.value = order; dragOverCol.value = null; _saveOrder(order)
}
// GSAP FLIP：记录卡片旧位置 -> 改状态/顺序让 Vue 重排 -> Flip.from 平滑滑到新位置。
// cards 带 data-flip-id，跨列移动(Vue 重建节点)也能按 id 匹配做位移动画。
async function flipBoard(mutate: () => void) {
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
async function _dropOnCard(targetId: string) {
  const drag = _dragId; _dragId = null
  if (!drag || drag === targetId) return
  const dragT = tasks.value.find((x) => x.id === drag), tgtT = tasks.value.find((x) => x.id === targetId)
  await flipBoard(() => {
    if (dragT && tgtT && dragT.status !== tgtT.status) patchTask(drag, { status: tgtT.status })
    _moveInOrder(drag, targetId)
  })
}
async function _dropOnCol(status: TaskStatus) {
  const drag = _dragId; _dragId = null
  if (!drag) return
  const dragT = tasks.value.find((x) => x.id === drag)
  await flipBoard(() => {
    dragOverCol.value = null
    if (dragT && dragT.status !== status) patchTask(drag, { status })
    _moveInOrder(drag, null)
  })
}
function patchTask(id: string, patch: { status?: TaskStatus }) {
  tasks.value = tasks.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
  const body: Record<string, unknown> = {}
  if (patch.status !== undefined) body.status = patch.status
  if (Object.keys(body).length) api.updateTask(id, body).catch(() => {})
}
function toggleSelect(id: string) { dbSelected.value = dbSelected.value.includes(id) ? dbSelected.value.filter((x) => x !== id) : [...dbSelected.value, id] }
function selectAll() { const ids = selIds.value; dbSelected.value = (ids.length > 0 && ids.every((i) => dbSelected.value.includes(i))) ? [] : ids.slice() }
function batchStatus(status: TaskStatus) {
  const ids = dbSelected.value.slice()
  tasks.value = tasks.value.map((t) => (ids.includes(t.id) ? { ...t, status } : t))
  dbSelected.value = []
  ids.forEach((id) => api.updateTask(id, { status }).catch(() => {}))
  toast.flash('已更新 ' + ids.length + ' 项状态')
}
function batchPriority(p: number) {
  const ids = dbSelected.value.slice()
  tasks.value = tasks.value.map((t) => (ids.includes(t.id) ? { ...t, priority: p } : t))
  dbSelected.value = []
  ids.forEach((id) => api.updateTask(id, { priority: p }).catch(() => {}))
  toast.flash('已设为 P' + p)
}
function batchMoveOut() {
  const ids = dbSelected.value.slice()
  tasks.value = tasks.value.filter((t) => !ids.includes(t.id))
  dbSelected.value = []
  ids.forEach((id) => api.taskMoveOut(id).catch(() => {}))
  toast.flash('已移出 ' + ids.length + ' 项 · 保留来源')
}
function batchDelete() {
  const ids = dbSelected.value.slice()
  tasks.value = tasks.value.filter((t) => !ids.includes(t.id))
  dbSelected.value = []
  ids.forEach((id) => api.deleteTask(id).catch(() => {}))
  toast.flash('已删除 ' + ids.length + ' 项')
}
function toggleSort(key: string) { dbSortKey.value = key; dbSortDir.value = (dbSortKey.value === key && dbSortDir.value === 'asc') ? 'desc' : 'asc' }
function newCapture() { router.push({ name: 'chat' }); setTimeout(() => { const c = document.getElementById('lx-composer'); if (c) c.focus() }, 80) }

async function load() {
  loading.value = true
  try {
    const [me, st] = await Promise.all([api.me(), api.getState()])
    myName.value = me.name || ''
    canEdit.value = (me.role || 'member') !== 'viewer'
    tasks.value = (((st as any).tasks || []) as any[]).map(mapTask)
    try { const o = JSON.parse(localStorage.getItem('lx_task_order') || '[]'); if (Array.isArray(o)) taskOrder.value = o } catch { /* ignore */ }
  } catch {
    toast.flash('加载任务失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- dbViews 导航列 -->
    <div v-if="!isMobile" class="flex flex-col border-r border-[var(--line)] bg-[var(--panel)]" :style="`width:${dbNavW}px;flex:0 0 ${dbNavW}px;`">
      <div class="border-b border-[var(--line)] p-4 pb-3"><div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">Todo 数据库</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">全部任务与进度</div></div>
      <div class="flex flex-1 flex-col gap-1 overflow-auto p-[10px]">
        <LoadingState v-if="loading" class="flex-1" />
        <template v-else>
          <a v-for="d in DB_DEFS" :key="d[0]" @click="dbView = d[0]" :style="`display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;${dbView===d[0]?'font:600 13px/1 var(--font);color:var(--accent-ink);background:var(--accent-bg);':'font:500 13px/1 var(--font);color:var(--text2);background:transparent;'}`"><i :class="`ph ${d[2]}`" style="font-size:15px;"></i>{{ d[1] }}<span class="ml-auto text-[11px] font-semibold text-[var(--text3)]">{{ counts[d[0]] }}</span></a>
        </template>
      </div>
    </div>

    <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
    <!-- 主区 -->
    <div class="flex flex-1 flex-col">
      <!-- 移动端 dbViews 横向 chips -->
      <div v-if="isMobile" class="flex flex-none items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--panel)] px-2 py-2">
        <a v-for="d in DB_DEFS" :key="d[0]" @click="dbView = d[0]" :style="`display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;cursor:pointer;white-space:nowrap;${dbView===d[0]?'background:var(--accent-bg);color:var(--accent-ink);font:600 12px/1 var(--font);':'color:var(--text2);font:500 12px/1 var(--font);'}`"><i :class="`ph ${d[2]}`" style="font-size:13px;"></i>{{ d[1] }}<span class="text-[10px] font-semibold text-[var(--text3)]">{{ counts[d[0]] }}</span></a>
      </div>
      <!-- 57px 头 -->
      <ViewHeader icon="ph-table" :title="dbViewName"><span class="lx-mono">{{ filteredTasks.length }}</span> 条<template #trailing>
        <div class="inline-flex gap-0.5 rounded-[9px] bg-[var(--mid)] p-[3px]">
          <button @click="dbLayout = 'table'" :style="`border:0;padding:6px 12px;border-radius:7px;font:${dbLayout==='table'?'600':'500'} 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:5px;${dbLayout==='table'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`"><i class="ph ph-rows"></i>表格</button>
          <button @click="dbLayout = 'board'" :style="`border:0;padding:6px 12px;border-radius:7px;font:${dbLayout==='board'?'600':'500'} 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:5px;${dbLayout==='board'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`"><i class="ph ph-kanban"></i>看板</button>
        </div>
        <button v-if="canEdit" @click="newCapture" class="flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12.5px] font-semibold text-[var(--accent-contrast)] shadow-md" style="border:0;cursor:pointer;"><i class="ph ph-plus"></i>新建</button>
      </template></ViewHeader>
      <!-- 筛选栏 -->
      <div :class="['flex flex-none items-center gap-2.5 border-b border-[var(--line)] bg-[var(--panel)] px-[18px]', isMobile ? 'flex-wrap py-2' : 'h-[52px]']">
        <div class="flex items-center gap-2 rounded-[9px] bg-[var(--mid)] px-[11px] py-[7px]" :style="isMobile ? 'width:100%;' : 'width:230px;'">
          <i class="ph ph-magnifying-glass text-[15px] text-[var(--text3)]"></i>
          <input v-model="dbSearch" placeholder="搜索任务标题" class="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[var(--text)]" />
        </div>
        <select v-model="dbProject" class="cursor-pointer rounded-[9px] border border-[var(--line2)] bg-[var(--panel)] px-[10px] py-[7px] text-[12.5px] font-semibold text-[var(--text2)]">
          <option v-for="o in projectOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="dbPriority" class="cursor-pointer rounded-[9px] border border-[var(--line2)] bg-[var(--panel)] px-[10px] py-[7px] text-[12.5px] font-semibold text-[var(--text2)]">
          <option v-for="o in priorityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <div class="flex-1"></div>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
      </div>
      <!-- 批量栏 -->
      <div v-if="dbSelected.length > 0" class="flex h-12 flex-none items-center gap-[9px] border-b border-[var(--line)] bg-[var(--accent-bg)] px-[18px]" style="animation: lx-fade .2s ease;">
        <span class="text-[13px] font-semibold text-[var(--accent-ink)]">已选 {{ dbSelected.length }} 项</span>
        <div class="flex-1"></div>
        <Button variant="outline" size="sm" @click="batchStatus('done')"><i class="ph ph-check-circle text-[var(--accent)]"></i>标记完成</Button>
        <Button variant="outline" size="sm" @click="batchStatus('in_progress')">进行中</Button>
        <Button variant="outline" size="sm" @click="batchPriority(1)">设为 P1</Button>
        <Button variant="outline" size="sm" @click="batchMoveOut">移出 todo</Button>
        <Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="batchDelete">删除</Button>
        <button @click="dbSelected = []" title="取消选择" class="flex h-[30px] w-[30px] items-center justify-center text-[16px] text-[var(--text2)]" style="border:0;border-radius:8px;background:transparent;cursor:pointer;"><i class="ph ph-x"></i></button>
      </div>

      <!-- 表格视图 -->
      <template v-if="dbLayout === 'table'">
        <div class="flex-1 overflow-auto">
          <div class="grid border-b border-[var(--line)] bg-[var(--bg)]" style="grid-template-columns:36px 1fr 112px 100px 76px 88px 60px;gap:0;padding:0 22px;position:sticky;top:0;z-index:1;" :style="isMobile ? 'min-width:640px;' : ''">
            <div class="flex items-center py-3"><span @click="selectAll" :style="allSelected ? 'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--accent);border:1px solid var(--accent);' : 'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px solid var(--line2);background:var(--panel);'"><i class="ph ph-check" :style="`font-size:11px;color:var(--accent-contrast);${allSelected ? '' : 'display:none;'}`"></i></span></div>
            <div v-for="h in [{k:'title',l:'标题'},{k:'project',l:'项目'},{k:'due',l:'截止'},{k:'priority',l:'优先级'}]" :key="h.k" @click="toggleSort(h.k)" :style="`padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:${dbSortKey===h.k?'var(--text)':'var(--text3)'};text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;`">{{ h.l }}<i :class="`ph ${dbSortKey===h.k?(dbSortDir==='asc'?'ph-caret-up':'ph-caret-down'):'ph-arrows-down-up'}`" :style="`font-size:12px;color:${dbSortKey===h.k?'var(--accent-ink)':'var(--text3)'};`"></i></div>
            <div class="py-3 px-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text3)]">负责人</div>
            <div class="py-3 px-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text3)]">隐私</div>
          </div>
          <div v-for="t in filteredTasks" :key="t.id" :style="`display:grid;grid-template-columns:36px 1fr 112px 100px 76px 88px 60px;gap:0;padding:0 22px;border-bottom:1px solid var(--line);align-items:center;background:${t.rowBg};${isMobile?'min-width:640px;':''}`" data-hv="0">
            <div class="flex items-center py-[13px]"><span @click="t.toggleSel" :style="t.selBoxStyle"><i class="ph ph-check" :style="`font-size:11px;color:var(--accent-contrast);${t.selCheck}`"></i></span></div>
            <div @click="t.open" class="min-w-0 cursor-pointer py-[13px] px-2"><div :style="`font:600 13.5px/1.4 var(--font);color:${t.titleColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.titleDeco}`">{{ t.title }}</div><div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]">{{ t.statusLabel }}</div></div>
            <div @click="t.open" class="cursor-pointer py-[13px] px-2"><span class="inline-flex items-center gap-[5px] text-[12px] font-medium text-[var(--text2)]"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:.55;"></span>{{ t.project }}</span></div>
            <div @click="t.open" :style="`padding:13px 8px;font:500 12.5px/1 var(--font);color:${t.dueColor};cursor:pointer;`"><span class="lx-mono">{{ t.due }}</span></div>
            <div @click="t.open" class="cursor-pointer py-[13px] px-2"><span :style="t.prioStyle">{{ t.prio }}</span></div>
            <div @click="t.open" class="min-w-0 cursor-pointer py-[13px] px-2"><span class="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[var(--text2)]"><span :style="`width:20px;height:20px;border-radius:50%;background:${t.assigneeColor};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);flex:0 0 auto;`">{{ t.assigneeInitial }}</span><span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ t.assignee }}</span></span></div>
            <div @click="t.open" class="cursor-pointer py-[13px] px-2"><span class="inline-flex items-center gap-[5px] text-[11.5px] font-medium text-[var(--text3)]"><span :style="`width:7px;height:7px;border-radius:2px;background:${t.scopeColor};`"></span>{{ t.scopeLabel }}</span></div>
          </div>
          <div v-if="filteredTasks.length === 0" class="flex flex-col items-center gap-2.5 px-5 pt-[70px] text-[var(--text3)]"><i class="ph ph-stack text-[30px]"></i><div class="text-[13px] font-medium">{{ tasks.length === 0 ? '还没有任务 - 去聊天框丢一句「明天下午前完成XX」' : '没有匹配当前筛选的任务' }}</div></div>
          <div style="height:40px;"></div>
        </div>
      </template>

      <!-- 看板视图 -->
      <template v-if="dbLayout === 'board'">
        <div ref="boardEl" class="flex flex-1 items-stretch gap-4 overflow-auto p-[18px]">
          <div v-for="col in boardCols" :key="col.key" @drop="col.onDrop" @dragover="col.onOver" @dragleave="col.onLeave" :style="`${isMobile?'flex:0 0 240px;min-width:240px;':'flex:1;min-width:0;'}background:var(--panel);border:1px solid ${col.hl?'var(--accent)':'var(--line)'};border-radius:14px;display:flex;flex-direction:column;overflow:hidden;transition:border-color .12s;${col.hl?'box-shadow:0 0 0 2px var(--accent-bg);':''}`">
            <div class="flex items-center gap-2 border-b border-[var(--line)] p-[13px_14px]"><span :style="`width:8px;height:8px;border-radius:50%;background:${col.color};`"></span><span class="text-[13px] font-semibold text-[var(--text)]">{{ col.name }}</span><span class="text-[11px] font-semibold text-[var(--text3)]">{{ col.count }}</span></div>
            <div v-stagger class="flex flex-1 flex-col gap-[9px] overflow-auto p-[10px]" style="min-height:120px;">
              <div v-for="c in col.cards" :key="c.id" :data-flip-id="'flip-task-' + c.id" draggable="true" @dragstart="c.onDragStart" @drop="c.onCardDrop" @dragover="c.onCardOver" @click="c.open" class="cursor-grab rounded-[11px] border border-[var(--line)] bg-[var(--bg)] p-[11px_12px] shadow-md" data-hv="2">
                <div :style="`font:600 13px/1.4 var(--font);color:${c.titleColor};${c.titleDeco}`">{{ c.title }}</div>
                <div class="mt-[9px] flex flex-wrap items-center gap-1.5"><span :style="c.prioStyle">{{ c.prio }}</span><span class="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text2)]"><i class="ph ph-folder text-[11px]"></i>{{ c.project }}</span><span :style="`font:500 11px/1 var(--font);color:${c.dueColor};`"><span class="lx-mono">{{ c.due }}</span></span><span :title="c.assignee" :style="`width:20px;height:20px;border-radius:50%;background:${c.assigneeColor};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);margin-left:auto;flex:0 0 auto;`">{{ c.assigneeInitial }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
