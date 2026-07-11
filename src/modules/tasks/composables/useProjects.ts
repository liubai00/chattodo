// 项目域 composable：项目列表（进度）+ 选中 + 选中项目任务列表 + 新建项目。
// 项目端点（createProject）归 tasks 域（TasksAPI），故本 composable 置于 tasks 模块。
// 任务行用 fmtTaskSubset（assignee 色/首字母、title、statusLabel、due、prio）。selId 跟随路由 params.selId。
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { AuthAPI } from '@/modules/auth/api'
import { AppAPI } from '@/modules/app/api'
import { TasksAPI } from '@/modules/tasks/api'
import { lxFmtDue } from '@/shared/utils/format'
import type { Workspace } from '@/shared/enums/workspace'
import type { TaskStatus } from '@/shared/enums/task-status'

export type Scope = Workspace | 'mixed'

export interface ProjectItem { id: string; name: string; desc: string; color: string }
export interface ProjectTaskItem {
  id: string; title: string; status: TaskStatus; project: string
  due: string; priority: number; scope: Scope
  assignee: string | null; collabFrom: string | null
}
export interface ProjectFmtTask {
  title: string; titleColor: string; titleDeco: string; statusLabel: string
  due: string; prio: string; prioStyle: string
  assigneeColor: string; assigneeInitial: string; open: () => void
}

export interface ProjectsProps {
  workspace: Workspace
  privacy: boolean
  openTask: (id: string) => void
  isMobile?: boolean
}

const PROJ_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-4)', 'var(--cat-3)']
const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
const PRIO_COLORS: Record<number, [string, string]> = { 1: ['var(--danger)', 'var(--danger-bg)'], 2: ['var(--idea)', 'var(--idea-bg)'], 3: ['var(--text2)', 'var(--mid)'], 4: ['var(--text3)', 'var(--mid)'] }
const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', in_progress: '进行中', done: '已完成' }

interface RawProjectRow { id: string; name: string; description?: string }
interface RawTaskRow {
  id: string; title: string; status: TaskStatus
  projectId?: string | null; dueAt?: string | null
  priority?: number; privacyScope?: string
  assignee?: string | null; collabFrom?: string | null
}
interface ProjectsState {
  projects?: RawProjectRow[]
  tasks?: RawTaskRow[]
  [k: string]: unknown
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

export function useProjects(props: ProjectsProps, notify: (m: string) => void) {
  const route = useRoute()
  const loading = ref(true)
  const myName = ref('')
  const canEdit = ref(false)
  const projects = ref<ProjectItem[]>([])
  const tasks = ref<ProjectTaskItem[]>([])
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
  function mapTask(t: RawTaskRow): ProjectTaskItem {
    return {
      id: t.id, title: t.title, status: t.status,
      project: t.collabFrom ? '协作' : projName(t.projectId),
      due: lxFmtDue(t.dueAt), priority: t.priority || 3,
      scope: (t.privacyScope || 'work') as Scope,
      assignee: t.assignee || null, collabFrom: t.collabFrom || null,
    }
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

  function fmtTaskSubset(t: ProjectTaskItem): ProjectFmtTask {
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

  async function load(): Promise<void> {
    loading.value = true
    try {
      const [me, st] = await Promise.all([AuthAPI.me(), AppAPI.getState()])
      myName.value = me.name || ''
      canEdit.value = (me.role || 'member') !== 'viewer'
      const s = st as unknown as ProjectsState
      const ps = s.projects || []
      projects.value = ps.map((p, idx) => ({ id: p.id, name: p.name, desc: p.description || '', color: PROJ_COLORS[idx % 4] }))
      tasks.value = (s.tasks || []).map(mapTask)
      selId.value = typeof route.params.selId === 'string' ? route.params.selId : null
    } catch {
      notify('加载项目失败，请刷新重试')
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  function selectProject(id: string): void { selId.value = id }
  watch(() => route.params.selId, (sid) => { selId.value = typeof sid === 'string' ? sid : null })
  function submitNewProject(): void {
    const name = newProjName.value.trim()
    if (!name) { notify('请输入项目名称'); return }
    TasksAPI.createProject(name, '').then((p) => {
      const color = MEMBER_COLORS[projects.value.length % MEMBER_COLORS.length]
      projects.value = [...projects.value, { id: p.id, name: p.name, desc: p.description || '', color }]
      newProjOpen.value = false; newProjName.value = ''
      selId.value = p.id
      notify('项目已创建 · 聊天里提到项目名会自动归属')
    }).catch((e: unknown) => notify('创建失败：' + errMsg(e)))
  }

  return {
    loading, canEdit, projList, selProject, selId, spTasks, spDone, spPct, modeLabel, modeIcon,
    newProjOpen, newProjName, selectProject, submitNewProject,
  }
}
