// 聊天发送子 composable：composer / @提及 / thinking / 快捷提示 / send 流式编排。
// send 是核心：chatStream 流式 + entities(任务/想法/非todo 卡片) + performed(动作) + plan + reply + error + fallback。
// 纯 @文档引用走本地快速计划分支（不发请求）。共享 ctx 中的消息/任务/想法/非todo/feed/会话状态。
import { ref, computed, nextTick } from 'vue'
import { ChatAPI } from '@/modules/chat/api'
import { expandTimeTokens } from '@/shared/utils/timeTokens'
import { isComposingEvent, shouldSendOnEnter } from '@/shared/utils/keyboard'
import { scrollMsgs, focusComposer, errMsg, visible, mapTask, mapIdea, mapNon } from '@/modules/chat/utils'
import { normalizeEntityKind, entityMsgMeta } from '@/modules/chat/entity-registry'
import type {
  ChatCtx, RawMsg, PlanItem, Mention, MentionCandidate, MentionItem, PendingRef,
  ChatEntity, ChatPerformed, ChatPlanItem, RawTaskRow, RawIdeaRow, RawNonRow,
} from '@/modules/chat/types'
import type { ChatResponse } from '@/types/api'

const MENTION_ICON: Record<string, string> = { person: 'ph-user', time: 'ph-clock', doc: 'ph-at' }
const MENTION_TYPE: Record<string, string> = { person: '人', time: '时间', doc: '文档' }

export function useChatSend(ctx: ChatCtx, loadConversations: () => void) {
  const { props, notify, rawMessages, tasks, ideas, nonTodos, feed, activeConversationId, myName, team, canEdit } = ctx

  const composer = ref('')
  const mentionOpen = ref(false)
  const mentionQuery = ref('')
  const mentionAt = ref(-1)
  const mentionIndex = ref(0)
  const pendingRefs = ref<PendingRef[]>([])
  const mentions = ref<Mention[]>([])
  const thinking = ref(false)
  const thinkText = ref('正在分析意图…')
  const composing = ref(false)

  let seq = 100
  const nextId = (): string => 'm' + (++seq)
  let _thinkTimer: ReturnType<typeof setTimeout> | null = null

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
  function thinkLabel(intent: string): string {
    const map: Record<string, string> = { greeting: '识别为问候 · 正在组织回复…', help: '识别为功能咨询 · 正在整理能力清单…', plan: '识别为规划请求 · 正在按截止与优先级编排…', query: '识别为查询请求 · 正在检索任务清单…', complete: '识别为完成命令 · 正在匹配目标任务…', delete: '识别为删除命令 · 正在匹配目标任务…', question: '识别为提问 · 正在组织回答…', capture: '初步判断为待归档内容 · 正在分类并提取时间 / 优先级…' }
    return map[intent] || '正在处理…'
  }
  function startThinking(text: string): void {
    if (_thinkTimer) clearTimeout(_thinkTimer)
    thinking.value = true
    thinkText.value = '正在分析意图…'
    const label = thinkLabel(guessIntent(text))
    _thinkTimer = setTimeout(() => { if (thinking.value) { thinkText.value = label; nextTick(scrollMsgs) } }, 420)
  }

  // ---- 提及 ----
  function timePresets(): { type: 'time'; entityType: 'time'; iso: string; label: string; insert: string }[] {
    const base = new Date(); base.setSeconds(0, 0)
    const at = (offset: number, h: number, label: string) => { const d = new Date(base); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return { type: 'time' as const, entityType: 'time' as const, iso: d.toISOString(), label, insert: label.replace(/\s+/, '').replace(':00', '点').replace('：00', '点') } }
    const dow = (target: number, h: number, label: string) => { const d = new Date(base); let diff = (target - d.getDay() + 7) % 7; if (diff === 0) diff = 7; d.setDate(d.getDate() + diff); d.setHours(h, 0, 0, 0); return { type: 'time' as const, entityType: 'time' as const, iso: d.toISOString(), label, insert: label.replace(/\s+/, '').replace(':00', '点') } }
    return [at(0, 18, '今天 18:00'), at(1, 10, '明天 10:00'), at(1, 18, '明天 18:00'), at(2, 10, '后天 10:00'), dow(5, 18, '本周五 18:00'), dow(1, 10, '下周一 10:00')]
  }
  function mentionCandidates(): MentionCandidate[] {
    const mq = mentionQuery.value.toLowerCase()
    const f = (arr: MentionCandidate[]): MentionCandidate[] => mq ? arr.filter((x) => String(x.label).toLowerCase().includes(mq)) : arr
    const me = myName.value
    const persons = f((team.value || []).filter((u) => u.name !== me).map((u) => ({ kind: 'person' as const, type: 'person', userId: u.id, label: u.name }))).slice(0, 4)
    const times = f(timePresets().map((t) => ({ kind: 'time' as const, type: 'time', iso: t.iso, label: t.label, insert: t.insert }))).slice(0, 5)
    const tdocs = f(tasks.value.filter((t) => visible(t.scope, props.privacy, props.workspace)).map((t) => ({ kind: 'doc' as const, type: 'doc', entityType: 'task', id: t.id, label: t.title }))).slice(0, 4)
    const projs = f([...new Set(tasks.value.map((t) => t.project).filter((p) => p && p !== '收件箱' && p !== '协作'))].map((p) => ({ kind: 'doc' as const, type: 'doc', entityType: 'project', id: 'p:' + p, label: p }))).slice(0, 3)
    const notes = f(nonTodos.value.filter((n) => visible(n.scope, props.privacy, props.workspace)).map((n) => ({ kind: 'doc' as const, type: 'doc', entityType: 'note', id: n.id, label: n.title }))).slice(0, 2)
    return [...persons, ...times, ...tdocs, ...projs, ...notes]
  }
  const mentionItems = computed<MentionItem[]>(() => {
    const cands = mentionCandidates()
    const _grpName: Record<string, string> = { person: '成员', time: '时间', doc: '文档' }
    let last = ''
    return cands.map((x, idx) => {
      const g = x.kind === 'doc' ? 'doc' : x.kind
      const head = g !== last ? _grpName[g] : null
      last = g
      return { label: x.label, icon: MENTION_ICON[x.kind] || 'ph-at', typeLabel: MENTION_TYPE[x.kind] || '', groupHead: head, bg: idx === (mentionIndex.value || 0) ? 'var(--mid)' : 'transparent', pick: () => pickMention(x) }
    })
  })
  const noMention = computed(() => mentionItems.value.length === 0)

  function replaceAtToken(insert: string): void {
    const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null
    const at = mentionAt.value
    if (el && at >= 0) {
      const val = composer.value
      const caret = el.selectionStart != null ? el.selectionStart : val.length
      composer.value = val.slice(0, at) + insert + val.slice(caret)
      nextTick(() => { el.value = composer.value; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' })
    }
  }
  function pickMention(item: MentionCandidate): void {
    if (item.kind === 'person') {
      replaceAtToken('@' + item.label + ' ')
      mentions.value = mentions.value.some((m) => m.type === 'person' && m.userId === item.userId) ? mentions.value : [...mentions.value, { type: 'person', userId: item.userId, label: item.label }]
      mentionOpen.value = false; mentionQuery.value = ''; focusComposer(); return
    }
    if (item.kind === 'time') {
      replaceAtToken((item.insert || item.label) + ' ')
      mentions.value = [...mentions.value.filter((m) => m.type !== 'time'), { type: 'time', iso: item.iso, label: item.label }]
      mentionOpen.value = false; mentionQuery.value = ''; focusComposer(); return
    }
    replaceAtToken('')
    pendingRefs.value = pendingRefs.value.some((r) => r.id === item.id) ? pendingRefs.value : [...pendingRefs.value, { type: item.entityType || '', id: item.id || '', label: item.label }]
    mentionOpen.value = false; mentionQuery.value = ''; focusComposer()
  }
  function removeRef(id: string): void { pendingRefs.value = pendingRefs.value.filter((r) => r.id !== id) }
  function collectMentions(text: string): Mention[] {
    const inline = (mentions.value || []).filter((m) => m.type === 'time' || (m.type === 'person' && text.includes('@' + m.label)))
    const docs = (pendingRefs.value || []).map((r) => ({ type: 'doc' as const, entityType: r.type, id: String(r.id).replace(/^p:/, ''), label: r.label }))
    return [...inline, ...docs]
  }
  function atButton(): void {
    const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null
    if (!el) return
    el.focus()
    const v = composer.value
    const sep = (v === '' || v.endsWith(' ')) ? '' : ' '
    composer.value = v + sep + '@'
    mentionOpen.value = true; mentionQuery.value = ''; mentionAt.value = composer.value.length - 1; mentionIndex.value = 0
    nextTick(() => { el.value = composer.value })
  }
  function onComposerInput(e: Event): void {
    const el = e.target as HTMLTextAreaElement
    composer.value = el.value
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    const val = el.value
    const caret = el.selectionStart != null ? el.selectionStart : val.length
    const upto = val.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at >= 0) { const q = upto.slice(at + 1); if (!/\s/.test(q)) { mentionOpen.value = true; mentionQuery.value = q; mentionAt.value = at; mentionIndex.value = 0; return } }
    if (mentionOpen.value) { mentionOpen.value = false; mentionQuery.value = '' }
  }
  function sendKey(e: KeyboardEvent): void {
    if (isComposingEvent(e, composing.value)) return
    if (mentionOpen.value) {
      const n = mentionCandidates().length
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex.value = Math.min((mentionIndex.value || 0) + 1, Math.max(0, n - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex.value = Math.max((mentionIndex.value || 0) - 1, 0); return }
      if (e.key === 'Escape') { e.preventDefault(); mentionOpen.value = false; return }
    }
    if (shouldSendOnEnter(e, composing.value)) { e.preventDefault(); mentionEnterOrSend() }
  }
  function mentionEnterOrSend(): void {
    if (mentionOpen.value) {
      const items = mentionCandidates()
      const it = items[mentionIndex.value || 0] || items[0]
      if (it) { pickMention(it); return }
      mentionOpen.value = false; return
    }
    send()
  }

  // ---- send (核心) ----
  async function send(forcedText?: string): Promise<void> {
    if (!canEdit.value) { notify('只读模式 · 无法创建内容'); return }
    const rawT = (forcedText ?? composer.value ?? '').trim(); const refs = pendingRefs.value.slice()
    if (!rawT && !refs.length) return
    composer.value = ''; const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null; if (el) { el.value = ''; el.style.height = 'auto' }
    const ms = collectMentions(rawT)
    const t = expandTimeTokens(rawT)
    const userMsg: RawMsg = { id: nextId(), role: 'user', text: t || '（就引用内容继续）', refs: refs.map((r) => r.label) }
    rawMessages.value = [...rawMessages.value, userMsg]; pendingRefs.value = []; mentions.value = []; mentionOpen.value = false; mentionQuery.value = ''
    nextTick(() => scrollMsgs(true))
    startThinking((refs.length && !t) ? '帮我规划' : t)

    // 纯 @文档引用 -> 本地快速计划
    if (refs.length && !t) {
      const parent = refs[0].label, isProj = refs[0].type === 'project'
      let plan: PlanItem[], planTitle: string, planSub: string, planNote: string
      if (isProj) {
        const pts = tasks.value.filter((x) => x.project === parent && x.status !== 'done' && visible(x.scope, props.privacy, props.workspace)).slice(0, 4)
        plan = pts.length ? pts.map((x, i) => ({ n: i + 1, t: x.title, d: x.due || '待定' })) : [{ n: 1, t: '该项目下暂无未完成任务', d: '' }]
        planTitle = '基于 @' + parent + ' 的下一步计划'; planSub = '只使用该项目下的可见未完成任务'; planNote = '未使用非 todo 内容'
      } else {
        const subsDef: string[][] = [['梳理目标与范围', '25 min'], ['完成核心部分', '45 min'], ['自查并同步 / 提交', '20 min']]
        plan = subsDef.map((s, i) => ({ n: i + 1, t: parent + ' · ' + s[0], d: s[1] }))
        planTitle = '基于 @' + parent + ' 拆成 3 个小任务'; planSub = '（引用拆解建议）'; planNote = '来源 @' + parent
      }
      const aiMsg: RawMsg = { id: nextId(), role: 'ai', kind: 'plan', planTitle, planSub, planNote, plan }
      setTimeout(() => { thinking.value = false; rawMessages.value = [...rawMessages.value, aiMsg]; nextTick(scrollMsgs) }, 260)
      return
    }

    try {
      let streamId: string | null = null; let gotAnyEvent = false
      const onDelta = (d: string) => {
        if (!d) return
        if (!streamId) { streamId = nextId(); rawMessages.value = [...rawMessages.value, { id: streamId, role: 'ai', kind: 'text', text: d, streaming: true }]; nextTick(scrollMsgs) }
        else { rawMessages.value = rawMessages.value.map((m) => m.id === streamId ? { ...m, text: (m.text || '') + d } : m); nextTick(scrollMsgs) }
      }
      let res: ChatResponse
      try {
        res = await ChatAPI.chatStream(t, { onStatus: (st) => { gotAnyEvent = true; if (st && st.intent && st.intent !== 'agent') thinkText.value = thinkLabel(st.intent) }, onDelta }, ms, activeConversationId.value)
      } catch (streamErr) {
        if (streamId || gotAnyEvent) throw streamErr
        res = await ChatAPI.chat(t, ms, activeConversationId.value)
      }
      const reply = (res.reply as string | undefined) || ''
      const intent = res.intent as string | undefined
      const entities = (res.entities as ChatEntity[] | undefined) || []
      const performed = (res.performed as ChatPerformed[] | undefined) || []
      const planItems = res.plan as ChatPlanItem[] | undefined

      const newMsgs: RawMsg[] = []
      let tasks2 = tasks.value.slice(), ideas2 = ideas.value.slice(), nonTodos2 = nonTodos.value.slice(), feedArr = feed.value.slice()
      for (const it of entities) {
        const kind = normalizeEntityKind(it.type)
        const reason = (it.result && it.result.reason) || reply || ''
        const meta = entityMsgMeta(kind)
        if (kind === 'task') {
          const nt = mapTask(it.entity as RawTaskRow); tasks2 = [nt, ...tasks2]
          feedArr = [{ id: nt.id, kind: 'task', title: nt.title, time: '刚刚', refId: nt.id }, ...feedArr]
          newMsgs.push({ id: nextId(), role: 'ai', kind: 'task', title: nt.title, reason, chips: [{ i: 'ph-calendar-blank', t: '截止 ' + nt.due }, { i: 'ph-folder', t: nt.project }, { i: meta.chipIcon, t: meta.chipPrefix + nt.priority }], refId: nt.id })
        } else if (kind === 'idea') {
          const ni = mapIdea(it.entity as RawIdeaRow); ideas2 = [ni, ...ideas2]
          feedArr = [{ id: ni.id, kind: 'idea', title: ni.title, time: '刚刚', refId: ni.id }, ...feedArr]
          newMsgs.push({ id: nextId(), role: 'ai', kind: 'idea', title: ni.title, reason: ni.reason || reason, suggest: ni.suggest, refId: ni.id })
        } else {
          const nn = mapNon(it.entity as RawNonRow); nonTodos2 = [nn, ...nonTodos2]
          feedArr = [{ id: nn.id, kind: 'nono', title: nn.title, time: '刚刚', refId: nn.id }, ...feedArr]
          newMsgs.push({ id: nextId(), role: 'ai', kind: 'nono', text: nn.title, reason: nn.reason || reason, refId: nn.id })
        }
      }
      for (const p of performed) {
        if (p.type === 'complete_task' && p.task) { const mt = mapTask(p.task); tasks2 = tasks2.map((x) => x.id === mt.id ? { ...x, ...mt } : x) }
        else if (p.type === 'update_task' && p.task) { const mt = mapTask(p.task); tasks2 = tasks2.map((x) => x.id === mt.id ? { ...x, ...mt } : x) }
        else if (p.type === 'delete_task') { tasks2 = tasks2.filter((x) => x.id !== p.id); feedArr = feedArr.filter((f) => f.refId !== p.id) }
        else if (p.type === 'convert_idea') { ideas2 = ideas2.filter((x) => x.id !== p.ideaId); feedArr = feedArr.filter((f) => f.refId !== p.ideaId) }
        else if (p.type === 'invite') { newMsgs.push({ id: nextId(), role: 'ai', kind: 'text', text: p.auto ? ('⚙️ 按你的规则「' + (p.rule || '') + '」，已自动邀请 ' + (p.userName || '成员') + ' 协作（待接受）') : ('🤝 已向 ' + (p.userName || '成员') + ' 发出协作邀请，对方接受后你们将同步进度。') }) }
      }
      if (planItems && planItems.length) {
        newMsgs.push({ id: nextId(), role: 'ai', kind: 'plan', planTitle: '接下来 · 建议计划', planSub: '基于当前可见 todo', planNote: '未使用非 todo 内容制定计划', plan: planItems.map((p, i) => ({ n: i + 1, t: p.task.title, d: (p.minutes || 30) + ' min', id: p.task.id, m: p.minutes || 30 })) })
      }
      if (!streamId) {
        const showReply = reply && (entities.length === 0 || intent === 'agent')
        if (showReply) newMsgs.push({ id: nextId(), role: 'ai', kind: 'text', text: reply })
        if (!newMsgs.length && reply) newMsgs.push({ id: nextId(), role: 'ai', kind: 'text', text: reply })
      }
      tasks.value = tasks2; ideas.value = ideas2; nonTodos.value = nonTodos2; feed.value = feedArr; thinking.value = false
      activeConversationId.value = (res.conversationId as string | undefined) || activeConversationId.value
      rawMessages.value = [...rawMessages.value.map((m) => m.id === streamId ? { ...m, streaming: false, text: reply || m.text || '' } : m), ...newMsgs]
      nextTick(() => { scrollMsgs(); focusComposer(); loadConversations(); props.afterSend() })
    } catch (e: unknown) {
      thinking.value = false
      rawMessages.value = [...rawMessages.value, { id: nextId(), role: 'ai', kind: 'error', errType: errMsg(e) || '请求失败', retryText: t }]
      nextTick(scrollMsgs)
    }
  }

  const showQuickPrompts = computed(() => rawMessages.value.length <= 2 && !thinking.value)
  const quickPrompts: { icon: string; label: string }[] = [
    { icon: 'ph-calendar-plus', label: '明天上午十点和客户开会' },
    { icon: 'ph-compass', label: '接下来两小时做什么？' },
    { icon: 'ph-list-checks', label: '有哪些任务' },
    { icon: 'ph-brain', label: '记住：我习惯上午做深度工作' },
  ]
  function runQuickPrompt(label: string): void {
    composer.value = label
    const el = document.getElementById('lx-composer') as HTMLTextAreaElement | null
    if (el) el.value = label
    send(label)
  }
  const modeLabel = computed(() => (props.workspace === 'work' ? '工作' : '个人') + (props.privacy ? ' · 隐私' : ''))

  const onCompStart = (): void => { composing.value = true }
  const onCompEnd = (): void => { composing.value = false }

  return {
    composer, mentionOpen, mentionItems, noMention, pendingRefs,
    thinking, thinkText, showQuickPrompts, quickPrompts, modeLabel,
    send, atButton, removeRef, onComposerInput, sendKey, onCompStart, onCompEnd, runQuickPrompt,
  }
}
