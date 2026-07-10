<script setup lang="ts">
// P3 第六个迁移视图：项目。master-detail 自包含。挂载取 me+getState(projects,tasks)。
// workspace/privacy 经 prop 传入(visible 过滤+modeChip)；openTask 经稳定回调 prop 传入
// (点击任务 -> 旧 App openTask 设 detailId 取详情)。2 列：项目列表+新建 | 选中项目任务列表。
// 任务行只用 fmtTask 子集(assignee 色/首字母、title+titleColor/deco、statusLabel、due、prio)。
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue } from '@/lib/format'
import Button from '@/components/ui/button/Button.vue'
import { useRoute } from 'vue-router'

type Workspace = 'work' | 'personal'
type Scope = Workspace | 'mixed'
type TaskStatus = 'todo' | 'in_progress' | 'done'

interface Project { id: string; name: string; desc: string; color: string }
interface TaskItem { id: string; title: string; status: TaskStatus; project: string; due: string; priority: number; scope: Scope; assignee: string | null; collabFrom: string | null }

const PROJ_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-4)', 'var(--cat-3)']
const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
const PRIO_COLORS: Record<number, [string, string]> = { 1: ['var(--danger)', 'var(--danger-bg)'], 2: ['var(--idea)', 'var(--idea-bg)'], 3: ['var(--text2)', 'var(--mid)'], 4: ['var(--text3)', 'var(--mid)'] }
const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', in_progress: '进行中', done: '已完成' }

const props = defineProps<{ workspace: Workspace; privacy: boolean; openTask: (id: string) => void; isMobile?: boolean }>()
const toast = useToast()
const route = useRoute()
const loading = ref(true)
const myName = ref('')
const canEdit = ref(false)
const projects = ref<Project[]>([])
const tasks = ref<TaskItem[]>([])
const selId = ref<string | null>(null)
const newProjOpen = ref(false)
const newProjName = ref('')

function memberColor(name: string): string {
  if (!name) return 'var(--cat-fallback)'
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}
function visible(scope: Scope): boolean {
  return !props.privacy || scope === props.workspace || scope === 'mixed'
}
function projName(pid: string | null | undefined): string {
  if (!pid) return '收件箱'
  const p = projects.value.find((x) => x.id === pid)
  return p ? p.name : pid
}
function mapTask(t: any): TaskItem {
  return { id: t.id, title: t.title, status: t.status as TaskStatus, project: t.collabFrom ? '协作' : projName(t.projectId), due: lxFmtDue(t.dueAt), priority: t.priority || 3, scope: (t.privacyScope || 'work') as Scope, assignee: t.assignee || null, collabFrom: t.collabFrom || null }
}

const visTasks = computed(() => tasks.value.filter((t) => visible(t.scope)))
const projList = computed(() => projects.value.map((p) => {
  const ts = visTasks.value.filter((t) => t.project === p.name)
  const done = ts.filter((t) => t.status === 'done').length
  return { id: p.id, name: p.name, desc: p.desc, color: p.color, count: ts.length, done, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, bg: selId.value === p.id ? 'var(--accent-bg)' : 'transparent' }
}))
const selProject = computed(() => projects.value.find((p) => p.id === selId.value) || projects.value[0] || null)
const spTasks = computed(() => selProject.value ? visTasks.value.filter((t) => t.project === selProject.value!.name).map(fmtTaskSubset) : [])
const spDone = computed(() => selProject.value ? visTasks.value.filter((t) => t.project === selProject.value!.name && t.status === 'done').length : 0)
const spPct = computed(() => (spTasks.value.length ? Math.round((spDone.value / spTasks.value.length) * 100) : 0))
const modeLabel = computed(() => (props.workspace === 'work' ? '工作' : '个人') + (props.privacy ? ' · 隐私' : ''))
const modeIcon = computed(() => (props.privacy ? 'ph-lock-simple' : 'ph-briefcase'))

interface FmtTask { title: string; titleColor: string; titleDeco: string; statusLabel: string; due: string; prio: string; prioStyle: string; assigneeColor: string; assigneeInitial: string; open: () => void }
function fmtTaskSubset(t: TaskItem): FmtTask {
  const done = t.status === 'done'
  const asg = t.assignee || myName.value || '我'
  const pc = PRIO_COLORS[t.priority] || PRIO_COLORS[3]
  return {
    title: t.title,
    titleColor: done ? 'var(--text3)' : 'var(--text)',
    titleDeco: done ? 'text-decoration:line-through;' : '',
    statusLabel: t.collabFrom ? STATUS_LABEL[t.status] + ' · 来自 ' + t.collabFrom : STATUS_LABEL[t.status],
    due: t.due,
    prio: 'P' + t.priority,
    prioStyle: 'display:inline-flex;padding:3px 8px;border-radius:6px;font:700 11px/1 var(--font);color:' + pc[0] + ';background:' + pc[1] + ';',
    assigneeColor: memberColor(asg),
    assigneeInitial: asg.slice(-1),
    open: () => props.openTask(t.id),
  }
}

async function load() {
  loading.value = true
  try {
    const [me, st] = await Promise.all([api.me(), api.getState()])
    myName.value = me.name || ''
    canEdit.value = (me.role || 'member') !== 'viewer'
    const ps = ((st as any).projects || []) as any[]
    projects.value = ps.map((p, idx) => ({ id: p.id, name: p.name, desc: p.description || '', color: PROJ_COLORS[idx % 4] }))
    tasks.value = (((st as any).tasks || []) as any[]).map(mapTask)
    selId.value = typeof route.params.selId === 'string' ? route.params.selId : null
  } catch {
    toast.flash('加载项目失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function selectProject(id: string) { selId.value = id }
watch(() => route.params.selId, (sid) => { selId.value = typeof sid === 'string' ? sid : null })
function submitNewProject() {
  const name = newProjName.value.trim()
  if (!name) { toast.flash('请输入项目名称'); return }
  api.createProject(name, '').then((p: any) => {
    const color = MEMBER_COLORS[projects.value.length % MEMBER_COLORS.length]
    projects.value = [...projects.value, { id: p.id, name: p.name, desc: p.description || '', color }]
    newProjOpen.value = false; newProjName.value = ''
    selId.value = p.id
    toast.flash('项目已创建 · 聊天里提到项目名会自动归属')
  }).catch((e: any) => toast.flash('创建失败：' + e.message))
}
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- 列表列 -->
    <div v-if="!isMobile || !selId" class="flex flex-col border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : 'width:280px;flex:0 0 280px;'">
      <div class="flex items-center gap-2 border-b border-[var(--line)] p-4 pb-3">
        <div class="flex-1"><div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">项目</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">按项目组织任务与进度</div></div>
        <button v-if="canEdit" @click="newProjOpen = !newProjOpen" title="新建项目" class="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--accent-bg)] text-[16px] text-[var(--accent-ink)]" style="border:0;cursor:pointer;"><i class="ph ph-plus"></i></button>
      </div>
      <div v-if="newProjOpen" class="flex gap-[7px] border-b border-[var(--line)] p-[10px_12px]" style="animation: lx-fade .2s ease;">
        <input v-model="newProjName" @keydown.enter.prevent="submitNewProject" placeholder="项目名称（回车创建）" class="min-w-0 flex-1 rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
        <Button size="sm" @click="submitNewProject">创建</Button>
      </div>
      <div class="flex flex-1 flex-col gap-1 overflow-auto p-[10px]">
        <div v-if="loading" class="flex flex-1 items-center justify-center text-[var(--text3)]">加载中…</div>
        <template v-else>
          <a v-for="p in projList" :key="p.id" @click="selectProject(p.id)" :style="`display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:11px;cursor:pointer;background:${p.bg};`" data-hv="0">
            <div class="flex items-center gap-2">
              <span :style="`width:9px;height:9px;border-radius:3px;background:${p.color};flex:0 0 auto;`"></span>
              <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-[var(--text)]">{{ p.name }}</span>
              <span class="text-[11px] font-semibold text-[var(--text3)]">{{ p.done }}/{{ p.count }}</span>
            </div>
            <div class="h-[5px] overflow-hidden rounded-[3px] bg-[var(--mid)]"><div :style="`height:100%;width:${p.pct}%;background:${p.color};border-radius:3px;`"></div></div>
          </a>
          <div v-if="projList.length === 0" class="flex flex-col items-center gap-2 p-9 text-center text-[var(--text3)]">
            <i class="ph ph-folders text-[24px]"></i>
            <div class="text-xs font-medium leading-relaxed">还没有项目<br/>点右上角 + 创建后，聊天里提到项目名会自动归属</div>
          </div>
        </template>
      </div>
    </div>

    <!-- 详情列 -->
    <div v-if="!isMobile || !!selId" class="flex flex-1 flex-col">
      <div class="flex h-[57px] flex-none items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-[18px]"><button v-if="isMobile && !!selId" @click="selId = null" class="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text2)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-caret-left"></i></button>
        <span :style="`width:12px;height:12px;border-radius:4px;background:${selProject?.color || 'var(--accent)'};flex:0 0 auto;`"></span>
        <span class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">{{ selProject?.name || '' }}</span>
        <span class="text-[12.5px] font-medium text-[var(--text3)]">{{ spDone }}/{{ spTasks.length }} 完成</span>
        <div class="flex-1"></div>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
      </div>
      <div class="flex-1 overflow-auto p-[22px]">
        <div v-if="!loading && selProject" class="mx-auto flex max-w-[720px] flex-col gap-[18px]">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
            <div class="text-[13.5px] font-medium leading-relaxed text-[var(--text2)]">{{ selProject.desc || '（无描述）' }}</div>
            <div class="mt-[14px] flex items-center gap-3">
              <div class="h-2 flex-1 overflow-hidden rounded-[4px] bg-[var(--mid)]"><div :style="`height:100%;width:${spPct}%;background:${selProject.color};border-radius:4px;`"></div></div>
              <span class="text-[13px] font-semibold text-[var(--text)]">{{ spPct }}%</span>
            </div>
          </div>
          <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">项目任务 · {{ spTasks.length }}</div>
          <div v-stagger class="flex flex-col gap-2">
            <div v-for="t in spTasks" :key="t.title" @click="t.open" class="flex cursor-pointer items-center gap-[11px] rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-3 shadow-md" data-hv="2">
              <span :style="`width:8px;height:8px;border-radius:50%;background:${t.assigneeColor};flex:0 0 auto;`"></span>
              <div class="min-w-0 flex-1">
                <div :style="`font:600 13.5px/1.4 var(--font);color:${t.titleColor};${t.titleDeco}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ t.title }}</div>
                <div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]">{{ t.statusLabel }} · <span class="lx-mono">{{ t.due }}</span></div>
              </div>
              <span :style="t.prioStyle">{{ t.prio }}</span>
              <span :style="`width:24px;height:24px;border-radius:50%;background:${t.assigneeColor};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 11px/1 var(--font);flex:0 0 auto;`">{{ t.assigneeInitial }}</span>
            </div>
          </div>
          <div v-if="spTasks.length === 0" class="flex flex-col items-center gap-2.5 pt-[60px] text-[var(--text3)]">
            <i class="ph ph-folders text-[30px]"></i>
            <div class="text-[13px] font-medium">这个项目还没有任务</div>
          </div>
        </div>
        <div v-else-if="!loading" class="flex flex-col items-center gap-2.5 pt-[90px] text-[var(--text3)]">
          <i class="ph ph-folders text-[30px]"></i>
          <div class="text-[13px] font-medium">选择左侧项目查看任务</div>
        </div>
      </div>
    </div>
  </div>
</template>
