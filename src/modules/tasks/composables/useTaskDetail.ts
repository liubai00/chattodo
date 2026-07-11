// 任务详情域 composable：全局浮层面板的状态与全部操作（patch/状态/指派/子任务/评论/协作邀请/移出/退出）。
// watch taskId -> 取 getTaskDetail+team+me；onClose 回调替代 emit('close')。视图只留模板与分段样式。
import { ref, reactive, computed, watch } from 'vue'
import { AuthAPI } from '@/modules/auth/api'
import { TasksAPI } from '@/modules/tasks/api'
import { lxFmtDue } from '@/shared/utils/format'
import { expandTimeTokens } from '@/shared/utils/timeTokens'
import type { TaskStatus } from '@/shared/enums/task-status'
import type { Workspace } from '@/shared/enums/workspace'
import type { TeamUser } from '@/types/api'

export type Scope = Workspace | 'mixed'

export interface TaskDetailProps {
  taskId: string | null
  afterChange: () => void
}

interface TaskDetailModel {
  id: string | null; title: string; status: TaskStatus; project: string; due: string
  priority: number; notes: string; raw: string; reason: string; conf: string
  gen: string; edited: boolean; assignee: string | null; collabFrom: string | null; scope: Scope
}
interface SubItem { id: string; text: string; done: boolean }
interface CommentItem { author: string; text: string; time: string }
interface ActivityItem { text: string; time: string }
interface Collab { userId: string; userName: string; status: string }
interface InviteResult { reused?: boolean }
interface HttpError extends Error { status?: number }

interface RawTaskRow {
  id: string; title: string; status: TaskStatus
  project?: string | null; dueAt?: string | null; priority?: number
  notes?: string; edited?: boolean; assignee?: string | null
  collabFrom?: string | null; privacyScope?: string
}
interface GenRecord { rawInput?: string; aiReason?: string; confidence?: number; createdAt?: string }
interface TaskDetailResp {
  task?: RawTaskRow
  generationRecord?: GenRecord
  subtasks?: Array<{ id: string; text: string; done: boolean }>
  comments?: Array<{ author: string; text: string; createdAt?: string }>
  activity?: Array<{ text: string; createdAt?: string }>
  collaborators?: Collab[]
  access?: string
}

const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
const COLLAB_META: Record<string, [string, string, string]> = { pending: ['待接受', 'var(--idea)', 'var(--idea-bg)'], accepted: ['协作中', 'var(--accent-ink)', 'var(--accent-bg)'], following: ['关注中', 'var(--text2)', 'var(--mid)'] }

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

export function useTaskDetail(props: TaskDetailProps, notify: (m: string) => void, onClose: () => void) {
  const loading = ref(true)
  const myName = ref('')
  const canEdit = ref(false)
  const team = ref<TeamUser[]>([])
  const tab = ref<'detail' | 'comments' | 'activity'>('detail')
  const invitePickerOpen = ref(false)
  const subInput = ref('')
  const cmtInput = ref('')
  const task = reactive<TaskDetailModel>({ id: null, title: '', status: 'todo', project: '', due: '', priority: 3, notes: '', raw: '', reason: '', conf: '', gen: '', edited: false, assignee: null, collabFrom: null, scope: 'work' })
  const subs = ref<SubItem[]>([])
  const comments = ref<CommentItem[]>([])
  const activity = ref<ActivityItem[]>([])
  const collabs = ref<Collab[]>([])
  const access = ref<string>('owner')

  function memberColor(name: string): string {
    if (!name) return 'var(--cat-fallback)'
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
    return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
  }

  const dAssignee = computed(() => task.assignee || myName.value || '我')
  const memberNames = computed(() => [...new Set([...team.value.map((u) => u.name), myName.value || '我', ...(task.assignee ? [task.assignee] : [])])].filter(Boolean).slice(0, 8))
  const detailMembers = computed(() => memberNames.value.map((nm) => ({ name: nm, initial: nm.slice(-1), color: memberColor(nm), on: dAssignee.value === nm, assign: () => assignTask(nm) })))
  const dCollabs = computed(() => collabs.value.filter((c) => COLLAB_META[c.status]).map((c) => ({ name: c.userName, label: COLLAB_META[c.status][0], fg: COLLAB_META[c.status][1], bg: COLLAB_META[c.status][2], dotc: COLLAB_META[c.status][1] })))
  const dIsOwner = computed(() => access.value === 'owner' && !task.collabFrom)
  const inviteCandidates = computed(() => team.value.filter((u) => u.name !== myName.value && !collabs.value.some((c) => c.userId === u.id)).map((u) => ({ name: u.name, invite: () => inviteMember(u) })))
  const subDone = computed(() => subs.value.filter((s) => s.done).length)

  async function load(id: string): Promise<void> {
    loading.value = true
    invitePickerOpen.value = false
    tab.value = 'detail'
    try {
      const [d, me, tm] = await Promise.all([TasksAPI.getTaskDetail(id), AuthAPI.me(), TasksAPI.team()])
      myName.value = me.name || ''
      canEdit.value = (me.role || 'member') !== 'viewer'
      team.value = tm.users || []
      const r = d as unknown as TaskDetailResp
      const t = r.task
      if (!t) { onClose(); return }
      const gr = r.generationRecord
      task.id = t.id
      task.title = t.title || ''
      task.status = t.status || 'todo'
      task.project = t.collabFrom ? '协作' : (t.project || '收件箱')
      task.due = lxFmtDue(t.dueAt)
      task.priority = t.priority || 3
      task.notes = t.notes || ''
      task.raw = (gr && gr.rawInput) || t.notes || ''
      task.reason = (gr && gr.aiReason) || ''
      task.conf = gr && gr.confidence != null ? String(gr.confidence) : ''
      task.gen = (gr && gr.createdAt) || ''
      task.edited = !!t.edited
      task.assignee = t.assignee || null
      task.collabFrom = t.collabFrom || null
      task.scope = (t.privacyScope || 'work') as Scope
      subs.value = (r.subtasks || []).map((s) => ({ id: s.id, text: s.text, done: s.done }))
      comments.value = (r.comments || []).map((c) => ({ author: c.author, text: c.text, time: c.createdAt || '' }))
      activity.value = (r.activity || []).map((a) => ({ text: a.text, time: a.createdAt || '' }))
      collabs.value = r.collaborators || []
      access.value = r.access || 'owner'
    } catch {
      notify('加载任务详情失败')
      onClose()
    } finally {
      loading.value = false
    }
  }
  watch(() => props.taskId, (id) => { if (id) load(id) }, { immediate: true })

  function logActivity(text: string): void {
    activity.value = [{ text, time: '刚刚' }, ...activity.value]
  }
  function patchTask(patch: Record<string, unknown>): void {
    const ep = { ...patch }
    if (typeof ep.title === 'string') ep.title = expandTimeTokens(ep.title)
    if (typeof ep.notes === 'string') ep.notes = expandTimeTokens(ep.notes)
    Object.assign(task, ep)
    const body: Record<string, unknown> = {}
    ;['title', 'notes', 'status', 'priority', 'assignee'].forEach((k) => { if (k in ep) body[k] = ep[k] })
    if ('scope' in ep) body.privacyScope = ep.scope
    if (Object.keys(body).length) TasksAPI.updateTask(task.id!, body).catch(() => {})
    props.afterChange()
  }
  function setStatus(s: TaskStatus): void {
    patchTask({ status: s })
    logActivity('状态改为「' + ({ todo: '待办', in_progress: '进行中', done: '已完成' } as Record<TaskStatus, string>)[s] + '」')
  }
  function assignTask(name: string): void {
    patchTask({ assignee: name })
    logActivity('指派给 ' + name)
    notify('已指派给 ' + name)
  }
  function toggleSub(sid: string): void {
    subs.value = subs.value.map((s) => s.id === sid ? { ...s, done: !s.done } : s)
    TasksAPI.toggleSubtask(sid).catch(() => {})
  }
  function addSub(): void {
    const v = subInput.value.trim()
    if (!v) return
    subInput.value = ''
    TasksAPI.addSubtask(task.id!, v)
      .then((sub) => { subs.value = [...subs.value, { id: sub.id, text: sub.text, done: sub.done }]; logActivity('添加子任务：' + v) })
      .catch((e: unknown) => notify('添加失败：' + errMsg(e)))
  }
  function addComment(): void {
    const v = cmtInput.value.trim()
    if (!v) return
    cmtInput.value = ''
    TasksAPI.addComment(task.id!, v, myName.value)
      .then((c) => { comments.value = [...comments.value, { author: c.author, text: c.text, time: c.createdAt || '刚刚' }]; logActivity('发表了评论') })
      .catch((e: unknown) => notify('评论失败：' + errMsg(e)))
  }
  function inviteMember(u: TeamUser, force = false): void {
    TasksAPI.inviteCollab(task.id!, u.id, force)
      .then((r) => {
        const rr = r as InviteResult
        notify(rr.reused ? (u.name + ' 已在协作名单里') : ('已邀请 ' + u.name + '（待接受）'))
        load(task.id!)
      })
      .catch((e: unknown) => {
        const err = e as HttpError
        if (err && err.status === 409 && window.confirm(err.message || '个人任务，确认邀请？')) { inviteMember(u, true); return }
        notify('邀请失败：' + errMsg(e))
      })
  }
  function inviteAll(): void {
    const cands = inviteCandidates.value
    if (!cands.length) return
    Promise.allSettled(cands.map((u) => TasksAPI.inviteCollab(task.id!, team.value.find((t) => t.name === u.name)?.id || '')))
      .then(() => { notify('已向 ' + cands.length + ' 位成员发出邀请'); load(task.id!) })
  }
  function moveOut(): void {
    if (!window.confirm('移出 todo？将保留来源与生成记录。')) return
    TasksAPI.taskMoveOut(task.id!)
      .then(() => { notify('已移出 todo · 保留来源与生成记录'); onClose(); props.afterChange() })
      .catch((e: unknown) => notify('移出失败：' + errMsg(e)))
  }
  function leaveCollab(): void {
    if (!window.confirm('退出协作后，这个任务将从你的列表中移除。确定退出吗？')) return
    TasksAPI.leaveTask(task.id!)
      .then(() => { notify('已退出协作'); onClose(); props.afterChange() })
      .catch((e: unknown) => notify('操作失败：' + errMsg(e)))
  }

  return {
    loading, canEdit, task, tab, invitePickerOpen, subInput, cmtInput, subs, subDone, comments, activity,
    detailMembers, dCollabs, dIsOwner, inviteCandidates, inviteAll, memberColor,
    setStatus, patchTask, toggleSub, addSub, addComment, moveOut, leaveCollab,
  }
}
