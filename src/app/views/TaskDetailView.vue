<script setup lang="ts">
// P4a：任务详情面板（最后一块 legacy 内容）。自包含全局浮层。
// watch taskId -> 取 getTaskDetail+team+me；3 tabs + 状态/优先级/负责人/协作/备注/子任务/来源/移出/退出协作 + 评论 + 活动。
// patchTask/toggleSub/addSub/addComment/assignTask/inviteMember/inviteAll/moveOut/leaveCollab。
// afterChange 回调(legacy loadState)刷新跨视图；emit close。
import { ref, reactive, computed, watch } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue } from '@/lib/format'
import { expandTimeTokens } from '@/lib/timeTokens'
import Button from '@/components/ui/button/Button.vue'

type TaskStatus = 'todo' | 'in_progress' | 'done'
type Scope = 'work' | 'personal' | 'mixed'

const props = defineProps<{ taskId: string | null; afterChange: () => void }>()
const emit = defineEmits<{ close: [] }>()
const toast = useToast()

const loading = ref(true)
const myName = ref('')
const canEdit = ref(false)
const team = ref<any[]>([])
const tab = ref<'detail' | 'comments' | 'activity'>('detail')
const invitePickerOpen = ref(false)
const subInput = ref('')
const cmtInput = ref('')
const task = reactive<{ id: string | null; title: string; status: TaskStatus; project: string; due: string; priority: number; notes: string; raw: string; reason: string; conf: string; gen: string; edited: boolean; assignee: string | null; collabFrom: string | null; scope: Scope }>({ id: null, title: '', status: 'todo', project: '', due: '', priority: 3, notes: '', raw: '', reason: '', conf: '', gen: '', edited: false, assignee: null, collabFrom: null, scope: 'work' })
const subs = ref<any[]>([])
const comments = ref<any[]>([])
const activity = ref<any[]>([])
const collabs = ref<any[]>([])
const access = ref<string>('owner')

const MEMBER_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
function memberColor(name: string): string { if (!name) return 'var(--cat-fallback)'; let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length] }
const COLLAB_META: Record<string, [string, string, string]> = { pending: ['待接受', 'var(--idea)', 'var(--idea-bg)'], accepted: ['协作中', 'var(--accent-ink)', 'var(--accent-bg)'], following: ['关注中', 'var(--text2)', 'var(--mid)'] }

const dAssignee = computed(() => task.assignee || myName.value || '我')
const memberNames = computed(() => [...new Set([...team.value.map((u) => u.name), myName.value || '我', ...(task.assignee ? [task.assignee] : [])])].filter(Boolean).slice(0, 8))
const detailMembers = computed(() => memberNames.value.map((nm) => ({ name: nm, initial: nm.slice(-1), color: memberColor(nm), on: dAssignee.value === nm, assign: () => assignTask(nm) })))
const dCollabs = computed(() => collabs.value.filter((c) => COLLAB_META[c.status]).map((c) => ({ name: c.userName, label: COLLAB_META[c.status][0], fg: COLLAB_META[c.status][1], bg: COLLAB_META[c.status][2], dotc: COLLAB_META[c.status][1] })))
const dIsOwner = computed(() => access.value === 'owner' && !task.collabFrom)
const inviteCandidates = computed(() => team.value.filter((u) => u.name !== myName.value && !collabs.value.some((c) => c.userId === u.id)).map((u) => ({ name: u.name, invite: () => inviteMember(u) })))
const subDone = computed(() => subs.value.filter((s) => s.done).length)
const hasSubs = computed(() => subs.value.length > 0)

async function load(id: string) {
  loading.value = true; invitePickerOpen.value = false; tab.value = 'detail'
  try {
    const [d, me, tm] = await Promise.all([api.getTaskDetail(id), api.me(), api.team()])
    myName.value = me.name || ''; canEdit.value = (me.role || 'member') !== 'viewer'; team.value = (tm as any).users || []
    const t = (d as any).task; if (!t) { emit('close'); return }
    const gr = (d as any).generationRecord
    task.id = t.id; task.title = t.title || ''; task.status = t.status || 'todo'; task.project = t.collabFrom ? '协作' : (t.project || '收件箱'); task.due = lxFmtDue(t.dueAt); task.priority = t.priority || 3; task.notes = t.notes || ''; task.raw = (gr && gr.rawInput) || t.notes || ''; task.reason = (gr && gr.aiReason) || ''; task.conf = gr && gr.confidence != null ? String(gr.confidence) : ''; task.gen = (gr && gr.createdAt) || ''; task.edited = !!t.edited; task.assignee = t.assignee || null; task.collabFrom = t.collabFrom || null; task.scope = (t.privacyScope || 'work') as Scope
    subs.value = ((d as any).subtasks || []).map((s: any) => ({ id: s.id, text: s.text, done: s.done }))
    comments.value = ((d as any).comments || []).map((c: any) => ({ author: c.author, text: c.text, time: c.createdAt || '' }))
    activity.value = ((d as any).activity || []).map((a: any) => ({ text: a.text, time: a.createdAt || '' }))
    collabs.value = (d as any).collaborators || []
    access.value = (d as any).access || 'owner'
  } catch { toast.flash('加载任务详情失败'); emit('close') }
  finally { loading.value = false }
}
watch(() => props.taskId, (id) => { if (id) load(id) }, { immediate: true })

function logActivity(text: string) { activity.value = [{ text, time: '刚刚' }, ...activity.value] }
function patchTask(patch: Record<string, unknown>) {
  const ep = { ...patch }
  if (typeof ep.title === 'string') ep.title = expandTimeTokens(ep.title)
  if (typeof ep.notes === 'string') ep.notes = expandTimeTokens(ep.notes)
  Object.assign(task, ep)
  const body: Record<string, unknown> = {}
  ;['title', 'notes', 'status', 'priority', 'assignee'].forEach((k) => { if (k in ep) body[k] = (ep as any)[k] })
  if ('scope' in ep) body.privacyScope = ep.scope
  if (Object.keys(body).length) api.updateTask(task.id!, body).catch(() => {})
  props.afterChange()
}
function setStatus(s: TaskStatus) { patchTask({ status: s }); logActivity('状态改为「' + ({ todo: '待办', in_progress: '进行中', done: '已完成' } as Record<TaskStatus, string>)[s] + '」') }
function assignTask(name: string) { patchTask({ assignee: name }); logActivity('指派给 ' + name); toast.flash('已指派给 ' + name) }
function toggleSub(sid: string) { subs.value = subs.value.map((s) => s.id === sid ? { ...s, done: !s.done } : s); api.toggleSubtask(sid).catch(() => {}) }
function addSub() { const v = subInput.value.trim(); if (!v) return; subInput.value = ''; api.addSubtask(task.id!, v).then((sub: any) => { subs.value = [...subs.value, { id: sub.id, text: sub.text, done: sub.done }]; logActivity('添加子任务：' + v) }).catch((e: any) => toast.flash('添加失败：' + e.message)) }
function addComment() { const v = cmtInput.value.trim(); if (!v) return; cmtInput.value = ''; api.addComment(task.id!, v, myName.value).then((c: any) => { comments.value = [...comments.value, { author: c.author, text: c.text, time: c.createdAt || '刚刚' }]; logActivity('发表了评论') }).catch((e: any) => toast.flash('评论失败：' + e.message)) }
function inviteMember(u: any, force = false) { api.inviteCollab(task.id!, u.id, force).then((r: any) => { toast.flash(r.reused ? (u.name + ' 已在协作名单里') : ('已邀请 ' + u.name + '（待接受）')); load(task.id!) }).catch((e: any) => { if (e && e.status === 409 && window.confirm(e.message || '个人任务，确认邀请？')) { inviteMember(u, true); return } toast.flash('邀请失败：' + e.message) }) }
function inviteAll() { const cands = inviteCandidates.value; if (!cands.length) return; Promise.allSettled(cands.map((u) => api.inviteCollab(task.id!, (team.value.find((t) => t.name === u.name) || {}).id || ''))).then(() => { toast.flash('已向 ' + cands.length + ' 位成员发出邀请'); load(task.id!) }) }
function moveOut() { if (!window.confirm('移出 todo？将保留来源与生成记录。')) return; api.taskMoveOut(task.id!).then(() => { toast.flash('已移出 todo · 保留来源与生成记录'); emit('close'); props.afterChange() }).catch((e: any) => toast.flash('移出失败：' + e.message)) }
function leaveCollab() { if (!window.confirm('退出协作后，这个任务将从你的列表中移除。确定退出吗？')) return; api.leaveTask(task.id!).then(() => { toast.flash('已退出协作'); emit('close'); props.afterChange() }).catch((e: any) => toast.flash('操作失败：' + e.message)) }
function close() { emit('close') }

const seg = (on: boolean) => on ? 'background:var(--panel);color:var(--text);box-shadow:var(--shadow);' : 'background:transparent;color:var(--text2);'
const segBtn = 'border:0;padding:6px 12px;border-radius:7px;font:600 12.5px/1 var(--font);cursor:pointer;'
const stBtn = 'border:0;padding:6px 10px;border-radius:6px;font:600 12px/1 var(--font);cursor:pointer;'
const prioBtn = 'border:0;padding:6px 10px;border-radius:6px;font:700 11.5px/1 var(--font);cursor:pointer;'
</script>

<template>
  <div>
    <div @click="close" style="position:absolute;inset:0;background:var(--overlay-scrim);z-index:8;"></div>
    <div style="position:absolute;top:0;right:0;bottom:0;width:440px;max-width:92%;background:var(--panel);border-left:1px solid var(--line);box-shadow:var(--shadow-lg);z-index:9;display:flex;flex-direction:column;animation:lx-slide .28s ease;">
      <div class="flex h-[57px] flex-none items-center gap-2.5 border-b border-[var(--line)] px-4">
        <span class="inline-flex items-center gap-[5px] rounded-full bg-[var(--accent-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--accent-ink)]"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>任务</span>
        <div class="flex-1"></div>
        <button @click="close" class="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] text-[var(--text2)]" style="border:0;background:transparent;cursor:pointer;" data-hv="0"><i class="ph ph-x"></i></button>
      </div>
      <div v-if="loading" class="flex flex-1 items-center justify-center text-[var(--text3)]">加载中…</div>
      <div v-else class="flex flex-1 flex-col gap-5 overflow-auto p-5">
        <input :value="task.title" @change="patchTask({ title: ($event.target as HTMLInputElement).value })" class="w-full border-0 bg-transparent text-xl font-semibold text-[var(--text)]" style="font-family:var(--display);" />
        <div class="inline-flex gap-0.5 self-start rounded-[9px] bg-[var(--mid)] p-[3px]">
          <button @click="tab = 'detail'" :style="segBtn + seg(tab === 'detail')">详情</button>
          <button @click="tab = 'comments'" :style="segBtn + seg(tab === 'comments')">评论</button>
          <button @click="tab = 'activity'" :style="segBtn + seg(tab === 'activity')">活动</button>
        </div>

        <template v-if="tab === 'detail'">
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-[14px]">
              <div class="flex items-center gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-circle-dashed"></i>状态</span><div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]"><button @click="setStatus('todo')" :style="stBtn + seg(task.status === 'todo')">待办</button><button @click="setStatus('in_progress')" :style="stBtn + seg(task.status === 'in_progress')">进行中</button><button @click="setStatus('done')" :style="stBtn + seg(task.status === 'done')">已完成</button></div></div>
              <div class="flex items-center gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-folder"></i>项目</span><span class="text-[13.5px] font-medium text-[var(--text)]">{{ task.project }}</span></div>
              <div class="flex items-center gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-calendar-blank"></i>截止</span><span class="text-[13.5px] font-medium text-[var(--text)]">{{ task.due }}</span></div>
              <div class="flex items-center gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-flag"></i>优先级</span><div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]"><button v-for="p in [1,2,3,4]" :key="p" @click="patchTask({ priority: p })" :style="prioBtn + seg(task.priority === p)">P{{ p }}</button></div></div>
              <div class="flex items-center gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-user"></i>负责人</span><div class="flex flex-wrap gap-[7px]"><button v-for="m in detailMembers" :key="m.name" @click="m.assign" :style="`display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 5px;border-radius:20px;font:600 12px/1 var(--font);border:1px solid ${m.on?'var(--accent)':'var(--line2)'};background:${m.on?'var(--accent-bg)':'var(--panel)'};color:${m.on?'var(--accent-ink)':'var(--text2)'};cursor:pointer;`"><span :style="`width:19px;height:19px;border-radius:50%;background:${m.color};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);`">{{ m.initial }}</span>{{ m.name }}</button></div></div>
              <div class="flex items-start gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 pt-2 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-users"></i>协作</span>
                <div class="flex min-w-0 flex-1 flex-col gap-2">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span v-for="(c, i) in dCollabs" :key="i" :style="`display:inline-flex;align-items:center;gap-[5px];padding:1 px 2.5;border-radius:20px;font:600 11.5px/1 var(--font);background:${c.bg};color:${c.fg};`"><span :style="`width:6px;height:6px;border-radius:50%;background:${c.dotc};`"></span>{{ c.name }} · {{ c.label }}</span>
                    <span v-if="dCollabs.length === 0" class="text-xs font-medium text-[var(--text3)]">还没有协作人</span>
                    <button v-if="dIsOwner && canEdit" @click="invitePickerOpen = !invitePickerOpen" class="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--line2)] bg-transparent px-2.5 py-1 text-[11.5px] font-semibold text-[var(--accent-ink)]" style="cursor:pointer;"><i class="ph ph-plus"></i>邀请</button>
                  </div>
                  <div v-if="invitePickerOpen && dIsOwner" class="flex flex-wrap gap-1.5 rounded-[10px] bg-[var(--mid)] p-[9px_11px]" style="animation:lx-fade .2s ease;">
                    <button v-for="u in inviteCandidates" :key="u.name" @click="u.invite" class="inline-flex items-center gap-[5px] rounded-full border border-[var(--line2)] bg-[var(--panel)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--text2)]" style="cursor:pointer;" data-hv="2"><i class="ph ph-user-plus text-[12px] text-[var(--accent-ink)]"></i>{{ u.name }}</button>
                    <button v-if="inviteCandidates.length > 1" @click="inviteAll" class="inline-flex items-center gap-[5px] rounded-full bg-[var(--accent)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-users-three text-[12px]"></i>邀请全员</button>
                    <span v-if="inviteCandidates.length === 0" class="text-[11.5px] font-medium leading-relaxed text-[var(--text3)]">团队成员都已在协作名单里</span>
                  </div>
                </div>
              </div>
              <div class="flex items-start gap-3"><span class="flex w-[76px] flex-none items-center gap-1.5 pt-2 text-xs font-semibold text-[var(--text3)]"><i class="ph ph-note"></i>备注</span><textarea :value="task.notes" @change="patchTask({ notes: ($event.target as HTMLTextAreaElement).value })" placeholder="补充说明…" class="h-16 flex-1 resize-none rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] p-[9px_11px] text-[13px] font-medium leading-relaxed text-[var(--text)]"></textarea></div>
            </div>
            <div class="flex flex-col gap-2.5">
              <div class="flex items-center gap-2"><span class="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">子任务</span><span class="text-[11px] font-semibold text-[var(--text3)]">{{ subDone }}/{{ subs.length }}</span></div>
              <div v-for="sb in subs" :key="sb.id" class="flex items-center gap-[9px]"><span @click="toggleSub(sb.id)" :style="`width:16px;height:16px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;${sb.done?'background:var(--accent);border:1px solid var(--accent);':'border:1.5px solid var(--line2);background:var(--bg);'}`"><i class="ph ph-check" :style="`font-size:10px;color:var(--accent-contrast);${sb.done?'':'display:none;'}`"></i></span><span :style="`flex:1;font:500 13px/1.5 var(--font);color:${sb.done?'var(--text3)':'var(--text)'};${sb.done?'text-decoration:line-through;':''}`">{{ sb.text }}</span></div>
              <div v-if="canEdit" class="flex items-center gap-2 rounded-[9px] bg-[var(--mid)] p-[8px_11px]"><i class="ph ph-plus text-[14px] text-[var(--text3)]"></i><input v-model="subInput" @keydown.enter.prevent="addSub" placeholder="添加子任务，回车确认" class="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] font-medium text-[var(--text)]" /></div>
            </div>
            <div class="h-px bg-[var(--line)]"></div>
            <div class="flex flex-col gap-3">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">来源与 AI 生成记录</div>
              <div class="flex flex-col gap-[5px] rounded-xl bg-[var(--mid)] p-[13px_14px]"><div class="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text3)]"><i class="ph ph-quotes"></i>原始输入</div><div class="text-[13.5px] font-medium leading-relaxed text-[var(--text)]">{{ task.raw }}</div></div>
              <div class="flex flex-col gap-[9px] p-[2px]">
                <div class="flex items-center gap-2 text-[12.5px] font-medium text-[var(--text2)]"><i class="ph ph-sparkle text-[var(--accent-ink)]"></i>AI 判断为<b class="text-[var(--accent-ink)]">任务</b><span class="text-[var(--text3)]">· 置信度 {{ task.conf || '—' }}</span></div>
                <div class="pl-6 text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ task.reason }}</div>
                <div class="flex items-center gap-2 pl-6 text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-clock"></i>生成于 {{ lxFmtDue(task.gen) }} · {{ task.edited ? '用户已修改过' : '未被修改' }}</div>
              </div>
            </div>
            <div class="h-px bg-[var(--line)]"></div>
            <button v-if="canEdit && !task.collabFrom" @click="moveOut" class="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-[var(--danger)] bg-[var(--danger-bg)] text-[13px] font-semibold text-[var(--danger)]" style="cursor:pointer;"><i class="ph ph-arrow-u-up-left"></i>移出 todo（这不是一个任务）</button>
            <div v-if="task.collabFrom" class="flex flex-col gap-2.5">
              <div class="flex items-center gap-2 rounded-[11px] bg-[var(--accent-bg)] p-[11px_13px] text-[12.5px] font-medium leading-relaxed text-[var(--accent-ink)]"><i class="ph ph-users"></i>协作任务 · 来自 {{ task.collabFrom }} · 你可以更新状态、评论与勾选子任务</div>
              <button @click="leaveCollab" class="flex h-[38px] w-full items-center justify-center gap-[7px] rounded-[11px] border border-[var(--line2)] bg-[var(--panel)] text-[12.5px] font-semibold text-[var(--text2)]" style="cursor:pointer;"><i class="ph ph-sign-out"></i>退出协作</button>
            </div>
          </div>
        </template>

        <template v-if="tab === 'comments'">
          <div class="flex flex-col gap-[15px]">
            <div v-for="(c, i) in comments" :key="i" class="flex gap-2.5"><span :style="`width:28px;height:28px;flex:0 0 auto;border-radius:50%;background:${memberColor(c.author)};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 12px/1 var(--font);`">{{ (c.author || '?').slice(-1) }}</span><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-[12.5px] font-semibold text-[var(--text)]">{{ c.author }}</span><span class="text-[11px] font-medium text-[var(--text3)]"><span class="lx-mono">{{ c.time }}</span></span></div><div class="mt-[5px] text-[13px] font-medium leading-relaxed text-[var(--text2)]">{{ c.text }}</div></div></div>
            <div v-if="canEdit" class="flex items-center gap-2 rounded-[11px] border border-[var(--line2)] bg-[var(--bg)] p-2 pl-3"><input v-model="cmtInput" @keydown.enter.prevent="addComment" placeholder="写评论，回车发送…" class="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[var(--text)]" /><button @click="addComment" class="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-paper-plane-tilt"></i></button></div>
          </div>
        </template>

        <template v-if="tab === 'activity'">
          <div class="flex flex-col">
            <div v-for="(a, i) in activity" :key="i" class="flex gap-[11px]"><div class="flex flex-col items-center" style="flex:0 0 auto;"><span class="mt-1 h-[9px] w-[9px] rounded-full bg-[var(--accent)]"></span><span class="my-0.5 w-[1.5px] flex-1 bg-[var(--line)]"></span></div><div class="flex-1 pb-4"><div class="text-[13px] font-medium leading-relaxed text-[var(--text)]">{{ a.text }}</div><div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]"><span class="lx-mono">{{ a.time }}</span></div></div></div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
