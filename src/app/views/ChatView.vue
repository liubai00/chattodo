<script setup lang="ts">
// P3 第八个视图(最后一个, 最复杂)：聊天。自包含，挂载取 me+getState+team。
// workspace/privacy + openTask/onOpenIdea/onOpenNon/onSendComplete/onSetWorkspace/onTogglePrivacy 经 prop/回调。
// send 是核心编排器：chatStream 流式 + entities(任务/想法/非todo 卡片) + performed(动作) + plan + reply + error + fallback。
// 跨视图状态(tasks/ideas/nonTodos/agent/autoRules/friends/team)经 onSendComplete(legacy loadState)刷新。
// 详情面板/今日胶囊保持 legacy(小 gap)。消息动作 undo/commitPlan/open/retry。
import { ref, computed, onMounted, nextTick } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue, lxPad } from '@/lib/format'
import { expandTimeTokens } from '@/lib/timeTokens'
import { isComposingEvent, shouldSendOnEnter } from '@/lib/keyboard'
import Button from '@/components/ui/button/Button.vue'

type Workspace = 'work' | 'personal'
type Scope = Workspace | 'mixed'
type TaskStatus = 'todo' | 'in_progress' | 'done'

interface RawMsg { id: string; role: string; kind?: string; text?: string; title?: string; reason?: string; suggest?: string; chips?: any[]; refId?: string; refType?: string; refs?: string[]; time?: string; isErr?: boolean; streaming?: boolean; errType?: string; retryText?: string; planTitle?: string; planSub?: string; planNote?: string; plan?: any[]; committed?: boolean; retrying?: boolean; intent?: string }
interface FeedItem { id: string; kind: string; title: string; time: string; refId: string }
interface TaskLite { id: string; title: string; status: TaskStatus; project: string; due: string; priority: number; scope: Scope; assignee: string | null; collabFrom: string | null; today: boolean }
interface IdeaLite { id: string; title: string; reason: string; suggest: string; scope: Scope }
interface NonLite { id: string; title: string; reason: string; scope: Scope }

const props = defineProps<{
  workspace: Workspace; privacy: boolean
  openTask: (id: string) => void
  openIdea: (id: string) => void
  openNon: (id: string) => void
  afterSend: () => void
  setWorkspace: (ws: Workspace) => void
  togglePrivacy: () => void
  isMobile?: boolean
}>()
const toast = useToast()

const loading = ref(true)
const myName = ref('')
const canEdit = ref(false)
const conversations = ref<any[]>([])
const activeConversationId = ref<string | null>(null)
const rawMessages = ref<RawMsg[]>([])
const feed = ref<FeedItem[]>([])
const feedQuery = ref('')
const tasks = ref<TaskLite[]>([])
const ideas = ref<IdeaLite[]>([])
const nonTodos = ref<NonLite[]>([])
const team = ref<any[]>([])
const thinking = ref(false)
const thinkText = ref('正在分析意图…')
const mentionOpen = ref(false); const mentionQuery = ref(''); const mentionAt = ref(-1); const mentionIndex = ref(0)
const pendingRefs = ref<any[]>([])
const mentions = ref<any[]>([])
const composer = ref<string>('')
const showList = ref(false)
const todayOpen = ref(false)
const todayLoading = ref(false)
const todayError = ref('')
const todayItems = ref<any[]>([])
let _seq = 100
let _composing = false as boolean
let _thinkTimer: ReturnType<typeof setTimeout> | null = null

function visible(scope: Scope): boolean { return !props.privacy || scope === props.workspace || scope === 'mixed' }
function projName(pid: string | null | undefined): string { if (!pid) return '收件箱'; return pid }
function mapTask(t: any): TaskLite { return { id: t.id, title: t.title, status: t.status, project: t.collabFrom ? '协作' : projName(t.projectId), due: lxFmtDue(t.dueAt), priority: t.priority || 3, scope: (t.privacyScope || 'work') as Scope, assignee: t.assignee || null, collabFrom: t.collabFrom || null, today: !!t.today } }
function mapIdea(i: any): IdeaLite { return { id: i.id, title: i.title, reason: i.aiReason || '', suggest: i.suggestedNextAction || '', scope: (i.privacyScope || 'work') as Scope } }
function mapNon(n: any): NonLite { return { id: n.id, title: n.title, reason: n.reason || '', scope: (n.privacyScope || 'work') as Scope } }

function buildMessages(chatRows: any[]): RawMsg[] {
  const messages: RawMsg[] = []; let lastDay = ''
  for (const m of (chatRows || []).slice(-60)) {
    const d = m.createdAt ? new Date(m.createdAt) : null
    if (d) { const day = `${d.getMonth() + 1}月${d.getDate()}日`; if (day !== lastDay) { lastDay = day; const t0 = new Date(); const isToday = d.getFullYear() === t0.getFullYear() && d.getMonth() === t0.getMonth() && d.getDate() === t0.getDate(); messages.push({ id: 'day_' + m.id, role: 'sys', text: isToday ? '今天' : day }) } }
    const time = d ? `${d.getMonth() + 1}/${d.getDate()} ${lxPad(d.getHours())}:${lxPad(d.getMinutes())}` : ''
    if (m.role === 'user') messages.push({ id: m.id, role: 'user', text: m.text, time, refType: m.refType || null, refId: m.refId || null })
    else messages.push({ id: m.id, role: 'ai', kind: 'text', text: m.text, isErr: !!m.isError, time })
  }
  return messages
}

// ---- 会话 ----
function loadConversations() { api.conversations().then((r: any) => { conversations.value = r.conversations || [] }).catch(() => {}) }
function newConversation() { api.createConversation().then((c: any) => { conversations.value = [c, ...conversations.value]; activeConversationId.value = c.id; rawMessages.value = []; if (props.isMobile) showList.value = false }).catch((e: any) => toast.flash('新建失败：' + e.message)) }
function switchConversation(id: string) { activeConversationId.value = id; if (props.isMobile) showList.value = false; api.conversationMessages(id).then((r: any) => { rawMessages.value = buildMessages(r.chat || []); nextTick(scrollMsgs) }).catch(() => {}) }
function deleteConversationUi(id: string) { const wasActive = activeConversationId.value === id; api.deleteConversation(id).then(() => { const rest = conversations.value.filter((c) => c.id !== id); conversations.value = rest; if (wasActive) { if (rest.length) switchConversation(rest[0].id); else load() } toast.flash('已删除对话') }).catch((e: any) => toast.flash('删除失败：' + e.message)) }

const conversationList = computed(() => conversations.value.map((c) => ({ id: c.id, title: c.title || '新对话', preview: (c.lastText || '还没有消息').replace(/\s+/g, ' ').slice(0, 30), time: lxFmtDue(c.updatedAt), active: c.id === activeConversationId.value, open: () => switchConversation(c.id), remove: () => deleteConversationUi(c.id) })))

// ---- feed ----
const FEED_LABEL: Record<string, string> = { task: '任务', idea: '待澄清', nono: '非 todo' }
const FEED_DOT: Record<string, string> = { task: 'var(--accent)', idea: 'var(--idea)', nono: 'var(--text3)' }
const feedList = computed(() => {
  const q = feedQuery.value.toLowerCase()
  return feed.value.filter((f) => !q || f.title.toLowerCase().includes(q)).map((f) => ({ ...f, label: FEED_LABEL[f.kind] || '', dot: FEED_DOT[f.kind] || 'var(--text3)', textColor: f.kind === 'nono' ? 'var(--text2)' : 'var(--text)', open: () => openEntity(f.kind, f.refId) }))
})
const feedCount = computed(() => feed.value.length)
const feedEmpty = computed(() => feed.value.length === 0)
function openEntity(kind: string, id: string) { if (kind === 'task') { if (tasks.value.some((t) => t.id === id)) props.openTask(id); else toast.flash('该任务已被删除或移出') } else if (kind === 'idea') { if (ideas.value.some((i) => i.id === id)) props.openIdea(id); else toast.flash('该想法已被处理') } else { if (nonTodos.value.some((n) => n.id === id)) props.openNon(id); else toast.flash('该记录已被处理') } }

// ---- 消息列表(加 isXxx + 动作) ----
const messageList = computed(() => rawMessages.value.map((m) => {
  const isSys = m.role === 'sys', isUser = m.role === 'user', isAgentText = m.role === 'ai' && m.kind === 'text', isTask = m.role === 'ai' && m.kind === 'task', isIdea = m.role === 'ai' && m.kind === 'idea', isNono = m.role === 'ai' && m.kind === 'nono', isPlan = m.role === 'ai' && m.kind === 'plan', isError = m.role === 'ai' && m.kind === 'error'
  return { ...m, isSys, isUser, isAgentText, isTask, isIdea, isNono, isPlan, isError, hasRefs: !!(m.refs && m.refs.length), isErr: !!m.isErr,
    open: () => { if (isTask) props.openTask(m.refId!); else if (isIdea) props.openIdea(m.refId!) },
    openRef: () => { if (m.refType === 'task') props.openTask(m.refId!); else if (m.refType === 'todo_idea') props.openIdea(m.refId!); else if (m.refId) props.openNon(m.refId!) },
    undo: () => undoEntity(m), commitPlan: () => commitPlan(m), retry: () => retryMsg(m) }
}))

// ---- 提及 ----
function timePresets() {
  const base = new Date(); base.setSeconds(0, 0)
  const at = (offset: number, h: number, label: string) => { const d = new Date(base); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return { type: 'time', entityType: 'time', iso: d.toISOString(), label, insert: label.replace(/\s+/, '').replace(':00', '点').replace('：00', '点') } }
  const dow = (target: number, h: number, label: string) => { const d = new Date(base); let diff = (target - d.getDay() + 7) % 7; if (diff === 0) diff = 7; d.setDate(d.getDate() + diff); d.setHours(h, 0, 0, 0); return { type: 'time', entityType: 'time', iso: d.toISOString(), label, insert: label.replace(/\s+/, '').replace(':00', '点') } }
  return [at(0, 18, '今天 18:00'), at(1, 10, '明天 10:00'), at(1, 18, '明天 18:00'), at(2, 10, '后天 10:00'), dow(5, 18, '本周五 18:00'), dow(1, 10, '下周一 10:00')]
}
function mentionCandidates() {
  const mq = mentionQuery.value.toLowerCase()
  const f = (arr: any[]) => mq ? arr.filter((x) => String(x.label).toLowerCase().includes(mq)) : arr
  const me = myName.value
  const persons = f((team.value || []).filter((u) => u.name !== me).map((u) => ({ kind: 'person', type: 'person', userId: u.id, label: u.name }))).slice(0, 4)
  const times = f(timePresets().map((t) => ({ kind: 'time', type: 'time', iso: t.iso, label: t.label, insert: t.insert }))).slice(0, 5)
  const tdocs = f(tasks.value.filter((t) => visible(t.scope)).map((t) => ({ kind: 'doc', type: 'doc', entityType: 'task', id: t.id, label: t.title }))).slice(0, 4)
  const projs = f([...new Set(tasks.value.map((t) => t.project).filter((p) => p && p !== '收件箱' && p !== '协作'))].map((p) => ({ kind: 'doc', type: 'doc', entityType: 'project', id: 'p:' + p, label: p }))).slice(0, 3)
  const notes = f(nonTodos.value.filter((n) => visible(n.scope)).map((n) => ({ kind: 'doc', type: 'doc', entityType: 'note', id: n.id, label: n.title }))).slice(0, 2)
  return [...persons, ...times, ...tdocs, ...projs, ...notes]
}
const MENTION_ICON: Record<string, string> = { person: 'ph-user', time: 'ph-clock', doc: 'ph-at' }
const MENTION_TYPE: Record<string, string> = { person: '人', time: '时间', doc: '文档' }
const mentionItems = computed(() => {
  const cands = mentionCandidates()
  const _grpName: Record<string, string> = { person: '成员', time: '时间', doc: '文档' }
  let last = ''
  return cands.map((x, idx) => { const g = x.kind === 'doc' ? 'doc' : x.kind; const head = g !== last ? _grpName[g] : null; last = g; return { label: x.label, icon: MENTION_ICON[x.kind] || 'ph-at', typeLabel: MENTION_TYPE[x.kind] || '', groupHead: head, bg: idx === (mentionIndex.value || 0) ? 'var(--mid)' : 'transparent', pick: () => pickMention(x) } })
})
const noMention = computed(() => mentionItems.value.length === 0)
function replaceAtToken(insert: string) { const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null; const at = mentionAt.value; if (el && at >= 0) { const val = composer.value; const caret = el.selectionStart != null ? el.selectionStart : val.length; composer.value = val.slice(0, at) + insert + val.slice(caret); nextTick(() => { el.value = composer.value; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }) } }
function pickMention(item: any) {
  if (item.kind === 'person') { replaceAtToken('@' + item.label + ' '); mentions.value = mentions.value.some((m) => m.type === 'person' && m.userId === item.userId) ? mentions.value : [...mentions.value, { type: 'person', userId: item.userId, label: item.label }]; mentionOpen.value = false; mentionQuery.value = ''; focusComposer(); return }
  if (item.kind === 'time') { replaceAtToken((item.insert || item.label) + ' '); mentions.value = [...mentions.value.filter((m) => m.type !== 'time'), { type: 'time', iso: item.iso, label: item.label }]; mentionOpen.value = false; mentionQuery.value = ''; focusComposer(); return }
  replaceAtToken(''); pendingRefs.value = pendingRefs.value.some((r) => r.id === item.id) ? pendingRefs.value : [...pendingRefs.value, { type: item.entityType, id: item.id, label: item.label }]; mentionOpen.value = false; mentionQuery.value = ''; focusComposer()
}
function removeRef(id: string) { pendingRefs.value = pendingRefs.value.filter((r) => r.id !== id) }
function collectMentions(text: string) { const inline = (mentions.value || []).filter((m) => m.type === 'time' || (m.type === 'person' && text.includes('@' + m.label))); const docs = (pendingRefs.value || []).map((r) => ({ type: 'doc', entityType: r.type, id: String(r.id).replace(/^p:/, ''), label: r.label })); return [...inline, ...docs] }
function atButton() { const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null; if (!el) return; el.focus(); const v = composer.value; const sep = (v === '' || v.endsWith(' ')) ? '' : ' '; composer.value = v + sep + '@'; mentionOpen.value = true; mentionQuery.value = ''; mentionAt.value = composer.value.length - 1; mentionIndex.value = 0; nextTick(() => { el.value = composer.value }) }
function onComposerInput(e: Event) { const el = e.target as HTMLTextAreaElement; composer.value = el.value; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; const val = el.value; const caret = el.selectionStart != null ? el.selectionStart : val.length; const upto = val.slice(0, caret); const at = upto.lastIndexOf('@'); if (at >= 0) { const q = upto.slice(at + 1); if (!/\s/.test(q)) { mentionOpen.value = true; mentionQuery.value = q; mentionAt.value = at; mentionIndex.value = 0; return } } if (mentionOpen.value) { mentionOpen.value = false; mentionQuery.value = '' } }
function sendKey(e: KeyboardEvent) { if (isComposingEvent(e, _composing)) return; if (mentionOpen.value) { const n = mentionCandidates().length; if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex.value = Math.min((mentionIndex.value || 0) + 1, Math.max(0, n - 1)); return } if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex.value = Math.max((mentionIndex.value || 0) - 1, 0); return } if (e.key === 'Escape') { e.preventDefault(); mentionOpen.value = false; return } } if (shouldSendOnEnter(e, _composing)) { e.preventDefault(); mentionEnterOrSend() } }
function mentionEnterOrSend() { if (mentionOpen.value) { const items = mentionCandidates(); const it = items[mentionIndex.value || 0] || items[0]; if (it) { pickMention(it); return } mentionOpen.value = false; return } send() }
function focusComposer() { const el = document.getElementById('lx-composer'); if (el) el.focus() }

// ---- 意图 / thinking ----
function guessIntent(t: string): string {
  const m = (t || '').trim()
  if (/(记一下|记个|提醒我|帮我记|加个任务|新建任务|加一条|建个任务)/.test(m)) return 'capture'
  if (/^(你好|您好|hi|hello|嗨|哈喽|hey|早上好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|谢啦|辛苦了)[呀啊哦呢!！。?？~～\s]*$/i.test(m)) return 'greeting'
  if (m.length <= 24 && /(你是谁|你能做什么|你会什么|你能干什么|能干嘛|会干嘛|怎么用|使用说明|有什么功能|帮助|help)/i.test(m)) return 'help'
  if (['做什么', '接下来', '安排什么', '该干嘛', '下一步做', '两小时', '怎么安排', '规划一下', '帮我规划', '帮我安排'].some((k) => m.includes(k))) return 'plan'
  if (/^(有什么|有哪些|哪些|列出|列一下|看看我?|查看|查一下|查询|显示|盘点|汇总|统计)/.test(m) && /(任务|待办|todo|事情|安排|到期|没做|完成)/i.test(m)) return 'query'
  if (/^(?:帮我)?(?:把)?(.{1,50}?)(?:标记为?完成|置为完成|标记完成|完成掉|搞定了|做完了|已完成|完成了)[。!！~～]*$/.test(m) || /^完成(?:任务)?[:：]/.test(m)) return 'complete'
  if (/^(?:帮我)?(?:把)?(.{1,50}?)(?:删了|删掉|删除|删除掉)[。!！~～]*$/.test(m) || /^(?:帮我)?删除/.test(m) || /^删掉/.test(m)) return 'delete'
  if (/[?？]$/.test(m) || /^(为什么|什么是|如何|怎么样|怎么办|是不是|能不能|可不可以|有没有)/.test(m)) return 'question'
  return 'capture'
}
function thinkLabel(intent: string): string { const map: Record<string, string> = { greeting: '识别为问候 · 正在组织回复…', help: '识别为功能咨询 · 正在整理能力清单…', plan: '识别为规划请求 · 正在按截止与优先级编排…', query: '识别为查询请求 · 正在检索任务清单…', complete: '识别为完成命令 · 正在匹配目标任务…', delete: '识别为删除命令 · 正在匹配目标任务…', question: '识别为提问 · 正在组织回答…', capture: '初步判断为待归档内容 · 正在分类并提取时间 / 优先级…' }; return map[intent] || '正在处理…' }
function startThinking(text: string) { if (_thinkTimer) clearTimeout(_thinkTimer); thinking.value = true; thinkText.value = '正在分析意图…'; const label = thinkLabel(guessIntent(text)); _thinkTimer = setTimeout(() => { if (thinking.value) { thinkText.value = label; nextTick(scrollMsgs) } }, 420) }

// ---- send (核心) ----
async function send(forcedText?: string) {
  if (!canEdit.value) { toast.flash('只读模式 · 无法创建内容'); return }
  const rawT = (forcedText ?? composer.value ?? '').trim(); const refs = pendingRefs.value.slice()
  if (!rawT && !refs.length) return
  composer.value = ''; const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null; if (el) { el.value = ''; el.style.height = 'auto' }
  const ms = collectMentions(rawT)
  const t = expandTimeTokens(rawT)
  const userMsg: RawMsg = { id: 'm' + (++_seq), role: 'user', text: t || '（就引用内容继续）', refs: refs.map((r) => r.label) }
  rawMessages.value = [...rawMessages.value, userMsg]; pendingRefs.value = []; mentions.value = []; mentionOpen.value = false; mentionQuery.value = ''
  nextTick(() => scrollMsgs(true))
  startThinking((refs.length && !t) ? '帮我规划' : t)

  // 纯 @文档引用 -> 本地快速计划
  if (refs.length && !t) {
    const parent = refs[0].label, isProj = refs[0].type === 'project'
    let plan: any[], planTitle: string, planSub: string, planNote: string
    if (isProj) { const pts = tasks.value.filter((x) => x.project === parent && x.status !== 'done' && visible(x.scope)).slice(0, 4); plan = pts.length ? pts.map((x, i) => ({ n: i + 1, t: x.title, d: x.due || '待定' })) : [{ n: 1, t: '该项目下暂无未完成任务', d: '' }]; planTitle = '基于 @' + parent + ' 的下一步计划'; planSub = '只使用该项目下的可见未完成任务'; planNote = '未使用非 todo 内容' }
    else { const subsDef = [['梳理目标与范围', '25 min'], ['完成核心部分', '45 min'], ['自查并同步 / 提交', '20 min']]; plan = subsDef.map((s, i) => ({ n: i + 1, t: parent + ' · ' + s[0], d: s[1] })); planTitle = '基于 @' + parent + ' 拆成 3 个小任务'; planSub = '（引用拆解建议）'; planNote = '来源 @' + parent }
    const aiMsg: RawMsg = { id: 'm' + (++_seq), role: 'ai', kind: 'plan', planTitle, planSub, planNote, plan }
    setTimeout(() => { thinking.value = false; rawMessages.value = [...rawMessages.value, aiMsg]; nextTick(scrollMsgs) }, 260)
    return
  }

  try {
    let streamId: string | null = null; let gotAnyEvent = false
    const onDelta = (d: string) => { if (!d) return; if (!streamId) { streamId = 'm' + (++_seq); rawMessages.value = [...rawMessages.value, { id: streamId, role: 'ai', kind: 'text', text: d, streaming: true }]; nextTick(scrollMsgs) } else { rawMessages.value = rawMessages.value.map((m) => m.id === streamId ? { ...m, text: (m.text || '') + d } : m); nextTick(scrollMsgs) } }
    let res: any
    try { res = await api.chatStream(t, { onStatus: (st: any) => { gotAnyEvent = true; if (st && st.intent && st.intent !== 'agent') thinkText.value = thinkLabel(st.intent) }, onDelta }, ms, activeConversationId.value) }
    catch (streamErr) { if (streamId || gotAnyEvent) throw streamErr; res = await api.chat(t, ms, activeConversationId.value) }
    const newMsgs: RawMsg[] = []
    let tasks2 = tasks.value.slice(), ideas2 = ideas.value.slice(), nonTodos2 = nonTodos.value.slice(), feedArr = feed.value.slice()
    for (const it of (res.entities || [])) {
      const reason = (it.result && it.result.reason) || res.reply || ''
      if (it.type === 'task') { const nt = mapTask(it.entity); tasks2 = [nt, ...tasks2]; feedArr = [{ id: nt.id, kind: 'task', title: nt.title, time: '刚刚', refId: nt.id }, ...feedArr]; newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'task', title: nt.title, reason, chips: [{ i: 'ph-calendar-blank', t: '截止 ' + nt.due }, { i: 'ph-folder', t: nt.project }, { i: 'ph-flag', t: 'P' + nt.priority }], refId: nt.id }) }
      else if (it.type === 'todo_idea') { const ni = mapIdea(it.entity); ideas2 = [ni, ...ideas2]; feedArr = [{ id: ni.id, kind: 'idea', title: ni.title, time: '刚刚', refId: ni.id }, ...feedArr]; newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'idea', title: ni.title, reason: ni.reason || reason, suggest: ni.suggest, refId: ni.id }) }
      else { const nn = mapNon(it.entity); nonTodos2 = [nn, ...nonTodos2]; feedArr = [{ id: nn.id, kind: 'nono', title: nn.title, time: '刚刚', refId: nn.id }, ...feedArr]; newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'nono', text: nn.title, reason: nn.reason || reason, refId: nn.id }) }
    }
    for (const p of (res.performed || [])) {
      if (p.type === 'complete_task' && p.task) { const mt = mapTask(p.task); tasks2 = tasks2.map((x) => x.id === mt.id ? { ...x, ...mt } : x) }
      else if (p.type === 'update_task' && p.task) { const mt = mapTask(p.task); tasks2 = tasks2.map((x) => x.id === mt.id ? { ...x, ...mt } : x) }
      else if (p.type === 'delete_task') { tasks2 = tasks2.filter((x) => x.id !== p.id); feedArr = feedArr.filter((f) => f.refId !== p.id) }
      else if (p.type === 'convert_idea') { ideas2 = ideas2.filter((x) => x.id !== p.ideaId); feedArr = feedArr.filter((f) => f.refId !== p.ideaId) }
      else if (p.type === 'invite') { newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'text', text: p.auto ? ('⚙️ 按你的规则「' + (p.rule || '') + '」，已自动邀请 ' + (p.userName || '成员') + ' 协作（待接受）') : ('🤝 已向 ' + (p.userName || '成员') + ' 发出协作邀请，对方接受后你们将同步进度。') }) }
    }
    if (res.plan && res.plan.length) { newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'plan', planTitle: '接下来 · 建议计划', planSub: '基于当前可见 todo', planNote: '未使用非 todo 内容制定计划', plan: res.plan.map((p: any, i: number) => ({ n: i + 1, t: p.task.title, d: (p.minutes || 30) + ' min', id: p.task.id, m: p.minutes || 30 })) }) }
    if (!streamId) { const showReply = res.reply && ((res.entities || []).length === 0 || res.intent === 'agent'); if (showReply) newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'text', text: res.reply }); if (!newMsgs.length && res.reply) newMsgs.push({ id: 'm' + (++_seq), role: 'ai', kind: 'text', text: res.reply }) }
    tasks.value = tasks2; ideas.value = ideas2; nonTodos.value = nonTodos2; feed.value = feedArr; thinking.value = false
    activeConversationId.value = res.conversationId || activeConversationId.value
    rawMessages.value = [...rawMessages.value.map((m) => m.id === streamId ? { ...m, streaming: false, text: (res.reply || m.text || '') } : m), ...newMsgs]
    nextTick(() => { scrollMsgs(); focusComposer(); loadConversations(); props.afterSend() })
  } catch (e: any) {
    thinking.value = false
    rawMessages.value = [...rawMessages.value, { id: 'm' + (++_seq), role: 'ai', kind: 'error', errType: (e && e.message) || '请求失败', retryText: t }]
    nextTick(scrollMsgs)
  }
}

function undoEntity(msg: RawMsg) {
  const kind = msg.kind, refId = msg.refId, title = msg.title || msg.text || ''
  if (!refId) return
  const p = kind === 'task' ? api.deleteTask(refId) : kind === 'idea' ? api.ideaDiscard(refId) : api.nonDiscard(refId)
  p.then(() => {
    if (kind === 'task') tasks.value = tasks.value.filter((x) => x.id !== refId)
    if (kind === 'idea') ideas.value = ideas.value.filter((x) => x.id !== refId)
    if (kind === 'nono') nonTodos.value = nonTodos.value.filter((x) => x.id !== refId)
    feed.value = feed.value.filter((f) => f.refId !== refId)
    rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { id: x.id, role: 'sys', text: '已撤销：' + String(title).slice(0, 30) } : x)
    toast.flash('已撤销'); props.afterSend()
  }).catch((e: any) => toast.flash('撤销失败：' + e.message))
}
function commitPlan(msg: RawMsg) {
  if (msg.committed) return
  const items = (msg.plan || []).filter((p) => p.id).map((p) => ({ id: p.id, minutes: p.m || 30 }))
  if (!items.length) { toast.flash('该计划没有可执行的任务'); return }
  api.commitPlan(items).then(() => { rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { ...x, committed: true } : x); toast.flash('已写入执行计划 · 在「今日」视图查看'); props.afterSend() }).catch((e: any) => toast.flash('操作失败：' + e.message))
}
function retryMsg(msg: RawMsg) {
  rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { ...x, retrying: true } as RawMsg : x)
  send(msg.retryText).finally(() => { rawMessages.value = rawMessages.value.map((x) => x.id === msg.id ? { ...x, retrying: false } as RawMsg : x) })
}

const showQuickPrompts = computed(() => rawMessages.value.length <= 2 && !thinking.value)
const quickPrompts = [
  { icon: 'ph-calendar-plus', label: '明天上午十点和客户开会' },
  { icon: 'ph-compass', label: '接下来两小时做什么？' },
  { icon: 'ph-list-checks', label: '有哪些任务' },
  { icon: 'ph-brain', label: '记住：我习惯上午做深度工作' },
]
function runQuickPrompt(label: string) { composer.value = label; const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null; if (el) el.value = label; send(label) }
const modeLabel = computed(() => (props.workspace === 'work' ? '工作' : '个人') + (props.privacy ? ' · 隐私' : ''))

// ---- 今日待办胶囊（迁移时省略，现补回）----
const todayCount = computed(() => tasks.value.filter((t) => t.today && t.status !== 'done').length)
const todaySubtitle = computed(() => todayLoading.value ? '加载中…' : (todayError.value ? '加载失败' : `${todayItems.value.filter((t) => t.status !== 'done').length} 条未完成`))
const todayPillStyle = computed(() => 'display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:16px;font:600 12px/1 var(--font);cursor:pointer;' + (todayOpen.value ? 'border:1px solid var(--accent);background:var(--accent-bg);color:var(--accent-ink);' : 'border:1px solid var(--line2);background:var(--panel);color:var(--text2);'))
function todayProgress(t: any): string {
  const sl = ({ todo: '待办', in_progress: '进行中', done: '已完成' } as Record<string, string>)[t.status] || '待办'
  const when = t.dueAt ? ('截止 ' + lxFmtDue(t.dueAt)) : t.plannedAt ? ('计划 ' + lxFmtDue(t.plannedAt)) : '未排期'
  const parts = [sl, when, 'P' + (t.priority || 3)]
  if (t.collabFrom) parts.unshift('协作·来自' + t.collabFrom)
  return parts.join(' · ')
}
const todayList = computed(() => todayItems.value.map((t) => ({ title: t.title, progress: todayProgress(t), done: t.status === 'done', dot: t.status === 'done' ? 'var(--text3)' : t.status === 'in_progress' ? 'var(--idea)' : 'var(--accent)', open: () => { todayOpen.value = false; props.openTask(t.id) } })))
function toggleTodayPanel() { todayOpen.value = !todayOpen.value; if (todayOpen.value) loadToday() }
function closeTodayPanel() { todayOpen.value = false }
function refreshToday() { loadToday() }
function loadToday() {
  todayLoading.value = true; todayError.value = ''
  const rank = (t: any) => { const m: Record<string, number> = { in_progress: 0, todo: 1, done: 2 }; return m[t.status] != null ? m[t.status] : 1 }
  api.listTasks({ view: 'today' }).then((list: any) => {
    const arr = Array.isArray(list) ? list : (list.tasks || [])
    const items = arr.filter((t: any) => t.status !== 'archived').sort((a: any, b: any) => rank(a) - rank(b) || (String(a.dueAt || a.plannedAt || '9999') < String(b.dueAt || b.plannedAt || '9999') ? -1 : 1))
    todayItems.value = items; todayLoading.value = false
  }).catch((e: any) => { todayLoading.value = false; todayError.value = (e && e.message) || '加载失败，请重试' })
}

function scrollMsgs(force?: boolean) { const b = document.getElementById('lx-msgs'); if (!b) return; if (force || b.scrollHeight - b.scrollTop - b.clientHeight < 180) b.scrollTop = b.scrollHeight }

async function load() {
  loading.value = true
  try {
    const [me, st, tm] = await Promise.all([api.me(), api.getState(), api.team()])
    myName.value = me.name || ''; canEdit.value = (me.role || 'member') !== 'viewer'
    const s = st as any
    tasks.value = ((s.tasks || []) as any[]).map(mapTask)
    ideas.value = ((s.todoIdeas || []) as any[]).filter((i) => i.status === 'clarifying').map(mapIdea)
    nonTodos.value = ((s.nonTodoOutputs || []) as any[]).map(mapNon)
    conversations.value = s.conversations || []
    activeConversationId.value = s.activeConversationId || null
    if (props.isMobile) showList.value = !activeConversationId.value
    rawMessages.value = buildMessages(s.chat)
    team.value = (tm as any).users || []
    const fd: FeedItem[] = []
    ;((s.tasks || []) as any[]).slice(0, 5).forEach((t) => fd.push({ id: t.id, kind: 'task', title: t.title, time: lxFmtDue(t.createdAt), refId: t.id }))
    ;((s.todoIdeas || []) as any[]).slice(0, 3).forEach((i) => fd.push({ id: i.id, kind: 'idea', title: i.title, time: lxFmtDue(i.createdAt), refId: i.id }))
    ;((s.nonTodoOutputs || []) as any[]).slice(0, 3).forEach((n) => fd.push({ id: n.id, kind: 'nono', title: n.title, time: lxFmtDue(n.createdAt), refId: n.id }))
    feed.value = fd
  } catch { toast.flash('加载聊天失败，请刷新重试') }
  finally { loading.value = false; nextTick(() => scrollMsgs(true)) }
}
onMounted(load)
</script>

<template>
  <div class="relative flex h-full min-h-0">
    <div v-if="todayOpen" @click="closeTodayPanel" style="position:absolute;inset:0;z-index:13;"></div>
    <!-- 中栏：工作区 + 会话 + 收集箱 -->
    <div v-if="!isMobile || showList" class="flex flex-col border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : 'width:304px;flex:0 0 304px;'">
      <div class="flex flex-col gap-3 border-b border-[var(--line)] p-[15px_16px_13px]">
        <div class="flex items-center gap-2">
          <div class="inline-flex gap-0.5 rounded-[9px] bg-[var(--mid)] p-[3px]">
            <button @click="props.setWorkspace('work')" :style="`border:0;padding:6px 14px;border-radius:7px;cursor:pointer;font:${props.workspace==='work'?'600':'500'} 13px/1 var(--font);${props.workspace==='work'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">工作</button>
            <button @click="props.setWorkspace('personal')" :style="`border:0;padding:6px 14px;border-radius:7px;cursor:pointer;font:${props.workspace==='personal'?'600':'500'} 13px/1 var(--font);${props.workspace==='personal'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">个人</button>
          </div>
          <div class="flex-1"></div>
          <button @click="props.togglePrivacy" title="隐私模式" :style="`border:0;width:32px;height:32px;border-radius:8px;cursor:pointer;background:${props.privacy?'var(--accent-bg)':'var(--mid)'};color:${props.privacy?'var(--accent-ink)':'var(--text2)'};display:flex;align-items:center;justify-content:center;`"><i class="ph ph-lock-simple"></i></button>
        </div>
        <div class="flex items-center gap-2 rounded-[9px] bg-[var(--mid)] px-[11px] py-2">
          <i class="ph ph-magnifying-glass text-[15px] text-[var(--text3)]"></i>
          <input v-model="feedQuery" placeholder="搜索收集内容" class="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[var(--text)]" />
        </div>
        <div class="relative flex-none">
          <button @click="toggleTodayPanel" :style="todayPillStyle" title="今日待办">
            <i class="ph ph-sun-horizon" style="font-size:14px;"></i>今日待办<template v-if="todayCount>0"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--accent);color:var(--accent-contrast);font:700 10px/16px var(--font);"><span class="lx-mono">{{ todayCount }}</span></span></template>
            <i :class="`ph ${todayOpen?'ph-caret-up':'ph-caret-down'}`" style="font-size:11px;opacity:.6;"></i>
          </button>
          <template v-if="todayOpen">
            <div style="position:absolute;top:calc(100% + 6px);left:0;width:340px;max-width:calc(100vw - 32px);max-height:62vh;background:var(--panel);border:1px solid var(--line2);border-radius:14px;box-shadow:var(--shadow-lg);z-index:14;display:flex;flex-direction:column;overflow:hidden;animation:lx-pop .18s ease;">
              <div style="display:flex;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid var(--line);flex:0 0 auto;">
                <i class="ph ph-sun-horizon" style="color:var(--accent-ink);font-size:17px;"></i>
                <span style="font:600 14px/1 var(--display);color:var(--text);">今日待办</span>
                <span style="font:600 11.5px/1 var(--font);color:var(--text3);">{{ todaySubtitle }}</span>
                <div style="flex:1"></div>
                <button @click="refreshToday" :disabled="todayLoading" title="刷新" style="width:28px;height:28px;border:0;border-radius:8px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;"><i :class="`ph ph-arrows-clockwise ${todayLoading?'lx-spin':''}`" style="font-size:14px;"></i></button>
              </div>
              <div style="flex:1;min-height:0;overflow:auto;padding:6px;">
                <div v-if="todayLoading && !todayList.length" style="display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--text3);padding:34px 12px;"><i class="ph ph-circle-notch lx-spin" style="font-size:22px;"></i><div style="font:500 12px/1 var(--font);">正在加载今日待办…</div></div>
                <div v-else-if="todayError" style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text3);padding:30px 14px;text-align:center;"><i class="ph ph-warning-circle" style="font-size:24px;color:var(--danger);"></i><div style="font:500 12.5px/1.5 var(--font);color:var(--danger);">{{ todayError }}</div><button @click="refreshToday" style="height:32px;padding:0 15px;border:1px solid var(--line2);border-radius:9px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;">重试</button></div>
                <div v-else-if="todayList.length===0" style="display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--text3);padding:34px 14px;text-align:center;"><i class="ph ph-confetti" style="font-size:26px;color:var(--accent-ink);"></i><div style="font:500 13px/1.6 var(--font);">今天没有到期或计划的待办<br/>享受专注的一天 🎉</div></div>
                <template v-else>
                  <a v-for="(t, i) in todayList" :key="i" @click="t.open" style="display:flex;gap:10px;padding:10px 11px;border-radius:10px;cursor:pointer;" data-hv="0">
                    <span :style="`width:9px;height:9px;border-radius:50%;margin-top:5px;flex:0 0 auto;background:${t.dot};`"></span>
                    <span style="flex:1;min-width:0;">
                      <span :style="`display:block;font:600 13px/1.4 var(--font);color:${t.done?'var(--text3)':'var(--text)'};${t.done?'text-decoration:line-through;':''}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ t.title }}</span>
                      <span style="display:block;font:500 11.5px/1.4 var(--font);color:var(--text3);margin-top:2px;">{{ t.progress }}</span>
                    </span>
                    <i class="ph ph-caret-right" style="font-size:13px;color:var(--text3);align-self:center;flex:0 0 auto;"></i>
                  </a>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div class="flex items-center justify-between px-[17px] pb-[7px] pt-[11px]">
        <span class="text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--text3)]">对话</span>
        <button @click="newConversation" title="新建对话" class="inline-flex items-center gap-1 rounded-[8px] border border-[var(--line2)] bg-[var(--panel)] px-[10px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]" style="cursor:pointer;"><i class="ph ph-plus text-[13px]"></i>新建</button>
      </div>
      <div class="flex max-h-[38%] flex-col gap-0.5 overflow-auto px-[9px] pb-[6px] pt-0.5" style="flex:0 1 auto;">
        <a v-for="c in conversationList" :key="c.id" @click="c.open" :style="`display:flex;gap:9px;padding:9px 10px;border-radius:10px;cursor:pointer;background:${c.active?'var(--accent-bg)':'transparent'};`" data-hv="0">
          <i class="ph ph-chat-teardrop-text" :style="`font-size:16px;margin-top:1px;flex:0 0 auto;color:${c.active?'var(--accent-ink)':'var(--text3)'};`"></i>
          <span class="min-w-0 flex-1"><span :style="`display:block;font:600 12.5px/1.3 var(--font);color:${c.active?'var(--accent-ink)':'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ c.title }}</span><span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium leading-tight text-[var(--text3)]">{{ c.preview }}</span></span>
          <span class="flex flex-col items-end gap-[3px]" style="flex:0 0 auto;"><span class="text-[10px] font-medium text-[var(--text3)]"><span class="lx-mono">{{ c.time }}</span></span><button @click.stop="c.remove" title="删除对话" class="px-px text-[12px] leading-none text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;">&times;</button></span>
        </a>
      </div>
      <div class="flex items-center justify-between border-t border-[var(--line)] px-[17px] pb-[7px] pt-[11px]">
        <span class="text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--text3)]">收集箱</span>
        <span class="text-[11px] font-semibold text-[var(--text3)]"><span class="lx-mono">{{ feedCount }}</span></span>
      </div>
      <div class="flex flex-1 flex-col gap-px overflow-auto px-[9px] pb-3 pt-0.5">
        <a v-for="f in feedList" :key="f.id" @click="f.open" class="flex gap-2.5 rounded-[10px] bg-transparent p-2.5" style="cursor:pointer;" data-hv="0">
          <span :style="`width:7px;height:7px;border-radius:50%;background:${f.dot};margin-top:6px;flex:0 0 auto;`"></span>
          <span class="min-w-0 flex-1"><span :style="`display:block;font:600 13px/1.4 var(--font);color:${f.textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ f.title }}</span><span class="mt-0.5 block text-[11.5px] font-medium leading-tight text-[var(--text3)]">{{ f.label }} · <span class="lx-mono">{{ f.time }}</span></span></span>
        </a>
        <div v-if="feedEmpty" class="flex flex-col items-center gap-2 px-3 py-9 text-center text-[var(--text3)]"><i class="ph ph-tray text-[24px]"></i><div class="text-xs font-medium leading-relaxed">还没有收集内容<br/>在右侧输入框丢一句话试试</div></div>
      </div>
    </div>

    <!-- 主区：消息流 + composer -->
    <div v-if="!isMobile || !showList" class="flex flex-1 flex-col">
      <div v-if="isMobile" class="flex h-[44px] flex-none items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3"><button @click="showList = true" class="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] text-[var(--text2)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-list"></i></button><span class="text-sm font-semibold text-[var(--text)]">对话</span><div class="flex-1"></div><span class="text-[11px] font-medium text-[var(--text3)]">{{ modeLabel }}</span></div>
      <div v-if="!canEdit" class="flex flex-none items-center gap-2 border-b border-[var(--line)] bg-[var(--idea-bg)] px-[18px] py-2 text-[12px] font-semibold text-[var(--idea)]"><i class="ph ph-lock-simple"></i>只读模式 · 你当前是「只读」角色，无法创建或编辑内容</div>
      <div id="lx-msgs" class="flex flex-1 flex-col gap-[17px] overflow-auto p-[26px]">
        <div v-if="loading" class="flex flex-1 items-center justify-center text-[var(--text3)]">加载中…</div>
        <template v-else>
          <template v-for="m in messageList" :key="m.id">
            <div v-if="m.isSys" class="self-center rounded-full bg-[var(--mid)] px-[13px] py-1.5 text-xs font-medium text-[var(--text3)]">{{ m.text }}</div>
            <div v-else-if="m.isUser" class="flex flex-col items-end gap-[5px] self-end" style="max-width:78%;animation:lx-fade .25s ease;">
              <div v-if="m.hasRefs" class="flex flex-wrap justify-end gap-[5px]"><span v-for="(r, i) in m.refs" :key="i" class="inline-flex items-center gap-1 rounded-full bg-[var(--accent-bg)] px-[9px] py-[3px] text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-at text-[11px]"></i>{{ r }}</span></div>
              <div :title="m.time || ''" class="rounded-[15px_15px_5px_15px] bg-[var(--accent)] px-[14px] py-2.5 text-sm font-medium leading-relaxed text-[var(--accent-contrast)] shadow-md" style="white-space:pre-wrap;">{{ m.text }}</div>
              <span v-if="m.refId" @click="m.openRef" class="cursor-pointer px-1 text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-arrow-elbow-down-right text-[11px]"></i>已生成 · 查看</span>
            </div>
            <div v-else-if="m.isAgentText" class="flex gap-[9px] self-start" style="max-width:82%;animation:lx-fade .25s ease;">
              <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);margin-top:2px;">灵</span>
              <div :title="m.time || ''" :style="`background:var(--panel);border:1px solid var(--line);padding:10px 14px;border-radius:5px 15px 15px 15px;font:500 14px/1.6 var(--font);color:${m.isErr?'var(--danger)':'var(--text)'};box-shadow:var(--shadow);white-space:pre-wrap;`">{{ m.text }}<span v-if="m.streaming" class="ml-px inline-block text-[var(--accent-ink)]" style="animation:lx-blink 1s steps(1) infinite;">▍</span></div>
            </div>
            <div v-else-if="m.isTask" class="flex flex-col gap-2 self-start" style="max-width:82%;animation:lx-fade .28s ease;">
              <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--accent-ink)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>任务<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
              <div @click="m.open" class="cursor-pointer rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-md" data-hv="2">
                <div class="flex items-start gap-2.5"><span class="mt-px h-[18px] w-[18px] flex-none rounded-md border-2 border-[var(--accent)]"></span><div class="min-w-0 flex-1"><div class="text-[14.5px] font-semibold leading-relaxed text-[var(--text)]">{{ m.title }}</div><div class="mt-2.5 flex flex-wrap gap-1.5"><span v-for="(c, i) in m.chips" :key="i" class="inline-flex items-center gap-[5px] rounded-[var(--r-sm)] bg-[var(--mid)] px-[9px] py-1 text-[11.5px] font-semibold text-[var(--text2)]"><i :class="`ph ${c.i}`" style="font-size:12px;"></i>{{ c.t }}</span></div></div></div>
                <div class="mt-[11px] flex items-center gap-1.5 border-t border-[var(--line)] pt-[11px] text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-check-circle text-[14px] text-[var(--accent)]"></i>已进入 Todo 数据库 · 点击查看详情与来源<span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 px-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
              </div>
            </div>
            <div v-else-if="m.isIdea" class="flex flex-col gap-2 self-start" style="max-width:82%;animation:lx-fade .28s ease;">
              <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--idea-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--idea)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--idea)]"></span>待澄清<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
              <div class="rounded-[var(--r)] border border-l-[3px] border-[var(--idea)] border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-md">
                <div class="text-[14.5px] font-semibold leading-relaxed text-[var(--text)]">{{ m.title }}</div>
                <div class="mt-2 rounded-[10px] bg-[var(--idea-bg)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]"><b class="text-[var(--idea)]">建议下一步：</b>{{ m.suggest }}</div>
                <div class="mt-3 flex items-center gap-2"><button @click="m.open" class="cursor-pointer rounded-[var(--r-sm)] border border-[var(--accent)] bg-transparent px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)]">去澄清</button><span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
              </div>
            </div>
            <div v-else-if="m.isNono" class="flex flex-col gap-2 self-start" style="max-width:82%;animation:lx-fade .28s ease;">
              <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--nono-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--nono)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--nono)]"></span>非 todo<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
              <div class="rounded-[var(--r)] border border-dashed border-[var(--line2)] bg-[var(--nono-bg)] p-3">
                <div class="text-sm font-medium leading-relaxed text-[var(--text2)]">{{ m.text }}</div>
                <div class="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存<span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
              </div>
            </div>
            <div v-else-if="m.isPlan" class="self-start rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] p-[15px] shadow-md" style="max-width:82%;animation:lx-fade .28s ease;">
              <div class="text-sm font-semibold text-[var(--text)]" style="font-family:var(--display);">{{ m.planTitle }}</div>
              <div class="mt-[3px] text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ m.planSub }}</div>
              <div class="mt-[13px] flex flex-col gap-[9px]"><div v-for="(p, i) in m.plan" :key="i" class="flex items-center gap-2.5"><span class="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[var(--accent-bg)] text-[11px] font-bold text-[var(--accent-ink)]">{{ p.n }}</span><span class="flex-1 text-[13.5px] font-medium leading-snug text-[var(--text)]">{{ p.t }}</span><span class="rounded-[var(--r-sm)] bg-[var(--mid)] px-2 py-[3px] text-[11px] font-semibold text-[var(--text2)]">{{ p.d }}</span></div></div>
              <div class="mt-[13px] flex items-center gap-1.5 border-t border-[var(--line)] pt-[11px] text-[11px] font-medium text-[var(--text3)]"><i class="ph ph-shield-check text-[13px] text-[var(--accent)]"></i>{{ m.planNote }}<span class="flex-1"></span><button v-if="!m.committed" @click="m.commitPlan" class="inline-flex items-center gap-[5px] rounded-lg bg-[var(--accent)] px-3 py-[7px] text-[11.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-play"></i>开始执行</button><span v-else class="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-check-circle"></i>已加入今日计划</span></div>
            </div>
            <div v-else-if="m.isError" class="flex flex-col gap-[9px] self-start rounded-[var(--r)] border-l-[3px] border-[var(--danger)] bg-[var(--danger-bg)] p-[13px_15px]" style="max-width:82%;animation:lx-fade .28s ease;">
              <div class="flex items-center gap-2 text-[13px] font-semibold text-[var(--danger)]"><i class="ph ph-warning-circle text-[16px]"></i>AI 生成失败 · {{ m.errType }}</div>
              <div class="text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">未静默失败 - 原始输入已保存，可重试，异常已记录到内部后台。</div>
              <div class="flex items-center gap-[9px]"><button @click="m.retry" class="inline-flex items-center gap-1.5 rounded-lg bg-[var(--danger)] px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-arrow-clockwise"></i>重试</button><span v-if="m.retrying" class="text-[11.5px] font-medium text-[var(--text3)]">重试中…</span></div>
            </div>
          </template>
          <div v-if="thinking" class="flex gap-[9px] self-start" style="animation:lx-fade .2s ease;">
            <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--accent-contrast)] opacity-85" style="font-family:var(--display);margin-top:2px;">灵</span>
            <div class="inline-flex items-center gap-2 rounded-[5px_14px_14px_14px] bg-[var(--mid)] px-[14px] py-2.5"><span class="inline-flex gap-1" style="flex:0 0 auto;"><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite;"></span><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite .2s;"></span><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite .4s;"></span></span><span class="lx-think">{{ thinkText }}</span></div>
          </div>
        </template>
      </div>

      <!-- composer -->
      <div class="relative border-t border-[var(--line)] bg-[var(--panel)] p-[14px_18px_18px]">
        <div v-if="mentionOpen" class="absolute bottom-[calc(100%-8px)] left-[18px] right-[18px] z-[6] max-h-[236px] overflow-y-auto overflow-hidden rounded-xl border border-[var(--line2)] bg-[var(--panel)] shadow-lg">
          <div class="px-[13px] pb-1.5 pt-[9px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">提及 · 人 / 时间 / 文档</div>
          <template v-for="(mi, i) in mentionItems" :key="i"><div v-if="mi.groupHead" class="px-[13px] pb-1 pt-2 text-[10px] font-semibold tracking-[0.06em] text-[var(--text3)]">{{ mi.groupHead }}</div><a @click="mi.pick" :style="`display:flex;align-items:center;gap:10px;padding:9px 13px;cursor:pointer;background:${mi.bg};`" data-hv="0"><i :class="`ph ${mi.icon}`" class="text-[16px] text-[var(--accent-ink)]"></i><span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-[var(--text)]">{{ mi.label }}</span><span class="rounded-md bg-[var(--mid)] px-[7px] py-[3px] text-[10.5px] font-semibold text-[var(--text3)]">{{ mi.typeLabel }}</span></a></template>
          <div v-if="noMention" class="px-[13px] py-3 text-[12.5px] font-medium text-[var(--text3)]">没有匹配的人 / 时间 / 文档</div>
        </div>
        <div v-if="showQuickPrompts" class="mb-2.5 flex flex-wrap gap-[7px]" style="animation:lx-fade .3s ease;"><button v-for="(q, i) in quickPrompts" :key="i" @click="runQuickPrompt(q.label)" class="inline-flex items-center gap-1.5 rounded-full border border-[var(--line2)] bg-[var(--panel)] px-3 py-[7px] text-[12.5px] font-medium text-[var(--text2)]" style="cursor:pointer;" data-hv="2"><i :class="`ph ${q.icon}`" class="text-[13px] text-[var(--accent-ink)]"></i>{{ q.label }}</button></div>
        <div class="flex flex-col gap-[9px] rounded-[var(--r)] border border-[var(--line2)] bg-[var(--bg)] p-[11px_12px] shadow-md">
          <div v-if="pendingRefs.length" class="flex flex-wrap gap-1.5"><span v-for="(r, i) in pendingRefs" :key="i" class="inline-flex items-center gap-1 rounded-full bg-[var(--accent-bg)] px-[5px] py-1 text-xs font-semibold text-[var(--accent-ink)]"><i class="ph ph-at text-xs"></i>{{ r.label }}<button @click="removeRef(r.id)" class="flex items-center justify-center rounded-full px-0.5 text-xs text-[var(--accent-ink)]" style="border:0;background:transparent;cursor:pointer;">&times;</button></span></div>
          <textarea id="lx-composer" rows="1" :value="composer" @input="onComposerInput" @keydown="sendKey" @compositionstart="_composing = true" @compositionend="_composing = false" placeholder="输入想法、任务，或用 @ 提及人 / 时间 / 文档…（Shift+Enter 换行）" class="max-h-[120px] resize-none border-0 bg-transparent text-sm font-medium leading-relaxed text-[var(--text)]" style="overflow-y:auto;"></textarea>
          <div class="flex items-center gap-[9px]">
            <button @click="atButton" title="引用任务 / 项目" class="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[var(--mid)] text-[15px] text-[var(--text2)]" style="border:0;cursor:pointer;"><i class="ph ph-at"></i></button>
            <div class="flex-1"></div>
            <Button @click="send()"><i class="ph ph-paper-plane-tilt"></i>发送</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
