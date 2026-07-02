import { llmMessagesJson } from './triage/llmProvider.js'
import { planNextBlock } from './planning.js'
import { visibleFilter } from './privacy.js'
import { detectDue, extractCommandTarget, triageInputSync } from './triage/ruleProvider.js'
import { persistCapture } from './capture.js'
import { nowIso } from '../lib/ids.js'

const AGENT_SYSTEM = `你是用户的 todo-first 智能助理。读懂用户意图，决定要执行的操作，并给出简洁、自然的中文回复。

第一步永远是判断意图，分两大类：
【A. 对你说的话】问候、提问、闲聊、查询（"有哪些任务"）、命令（"把X标记完成""删掉X""改到明天"）——直接回答或执行对应动作，绝对不要为这类输入创建任何 task/idea/non_todo。查询类问题直接用上下文里的任务列表回答。
【B. 要归档的内容】用户丢进来的想法、待办、信息——才需要 create_* 动作。

可用动作（放进 actions 数组，可为空、可多个）：
- create_task {title, dueAt(ISO字符串或null), priority(1-4), durationMinutes(数字或null), tags(字符串数组), privacyScope(work|personal|mixed), notes}
- create_idea {title, suggestedNextAction, privacyScope}   // 有行动倾向但需澄清
- create_non_todo {title, summary, privacyScope}           // 只是想法/参考/摘录
- complete_task {id}                                        // 标记完成，id 用上下文里的任务 id
- update_task {id, patch}                                   // 修改字段，如 {priority:1} 或 {dueAt:"..."}
- delete_task {id}                                          // 删除任务（仅当用户明确要求删除）
- plan {}                                                   // 用户问"接下来做什么/两小时安排"时
- remember {note}                                           // 用户表达长期偏好/习惯/固定事实时（"以后都…""我习惯…"），写入长期记忆

你能看到之前的对话历史：结合上文理解省略与指代（例如刚创建了任务后用户说"改到九点"，指的就是那个任务，用 update_task 修改它的 dueAt）。上下文 JSON 里的 memory 是你的长期记忆，判断时要遵循。

判断原则：真正可执行→create_task；模糊→create_idea；非行动信息→create_non_todo。可结合上下文里的已有任务做 complete/update/delete/plan。拿不准是否该删除时，先在 reply 里确认，不要直接删。

铁律：只有 actions 数组里的动作会被真正执行。actions 为空却在 reply 里说"已添加/已完成/已删除"是撒谎，绝对禁止。动作格式必须逐字使用上面列出的 type 名（如 create_task），示例：
{"reply":"好的，已记为任务。","actions":[{"type":"create_task","title":"明晚八点去吃饭","dueAt":"2026-07-03T20:00:00+08:00","priority":3,"privacyScope":"personal","tags":[]}]}
必须严格只输出一个 JSON 对象：{"reply":"...","actions":[...]}，不要输出多余文字或代码块。`

// The wild west of LLM outputs: accept common aliases / nestings and map them
// onto our canonical {type, payload} shape. Unknown → null (skipped).
const TYPE_ALIAS = {
  create_task: 'create_task', add_task: 'create_task', new_task: 'create_task', createtask: 'create_task', task: 'create_task', add_todo: 'create_task', create_todo: 'create_task',
  create_idea: 'create_idea', add_idea: 'create_idea', createidea: 'create_idea', idea: 'create_idea',
  create_non_todo: 'create_non_todo', createnontodo: 'create_non_todo', non_todo: 'create_non_todo', create_note: 'create_non_todo', add_note: 'create_non_todo', note: 'create_non_todo',
  complete_task: 'complete_task', completetask: 'complete_task', finish_task: 'complete_task', done_task: 'complete_task', mark_done: 'complete_task', complete: 'complete_task', done: 'complete_task',
  update_task: 'update_task', updatetask: 'update_task', edit_task: 'update_task', modify_task: 'update_task', update: 'update_task',
  delete_task: 'delete_task', deletetask: 'delete_task', remove_task: 'delete_task', del_task: 'delete_task', delete: 'delete_task', remove: 'delete_task',
  plan: 'plan', make_plan: 'plan', schedule: 'plan',
  remember: 'remember', memorize: 'remember', save_memory: 'remember', add_memory: 'remember',
}

// Append a durable note to the agent's long-term memory (kept ~1600 chars, oldest dropped).
export function appendMemory(repos, note) {
  const clean = String(note || '').trim().slice(0, 200)
  if (!clean) return null
  const cur = (repos.agent.get() || {}).memory || ''
  const d = new Date()
  let next = (cur ? cur + '\n' : '') + `· [${d.getMonth() + 1}/${d.getDate()}] ${clean}`
  if (next.length > 1600) next = next.slice(next.length - 1600).replace(/^[^·]*·/, '·')
  return repos.agent.update({ memory: next })
}
const canonType = (s) => TYPE_ALIAS[String(s || '').trim().toLowerCase().replace(/[-\s]+/g, '_').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()] || null

export function normalizeAction(a) {
  if (!a) return null
  if (typeof a === 'string') { const t = canonType(a); return t ? { type: t, payload: {} } : null }
  if (typeof a !== 'object') return null
  let type = canonType(a.type || a.action || a.name || a.tool || a.kind)
  let payload = a.task || a.idea || a.nonTodo || a.non_todo || a.params || a.args || a.data || a.payload || a
  // single-key form: {"create_task": {...}}
  if (!type) {
    const keys = Object.keys(a)
    for (const k of keys) {
      const t = canonType(k)
      if (t) { type = t; payload = (a[k] && typeof a[k] === 'object') ? a[k] : a; break }
    }
  }
  if (!type) return null
  if (!payload || typeof payload !== 'object') payload = {}
  const title = payload.title || payload.name || payload.task || payload.content || payload.text
  return { type, payload: { ...payload, title: typeof title === 'string' ? title : payload.title }, id: a.id || payload.id || null, patch: a.patch || payload.patch || null }
}

// Model-driven chat: the LLM reads intent → returns {reply, actions}; we execute
// the actions against the todo DB (with generation records) and reply naturally.
// Returns the same unified shape as the rule chat.
export async function agentChat(repos, { message, aiConfig }) {
  const settings = repos.settings.get()
  const visibleTasks = visibleFilter(repos.tasks.all(), settings)
  const profile = repos.agent.get()
  const context = {
    now: nowIso(),
    workspaceMode: settings.workspaceMode,
    privacyMode: settings.privacyMode,
    agent: { soul: profile.soul, memory: profile.memory, preferences: profile.preferences, workingStyle: profile.workingStyle },
    openTasks: visibleTasks
      .filter((t) => t.status !== 'done' && t.status !== 'archived')
      .slice(0, 40)
      .map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority })),
  }
  // 多轮上下文：带上最近的对话历史（排除报错消息），让"改到九点"这类指代可解析。
  const history = repos.chat.all()
    .filter((m) => !m.isError)
    .slice(-12)
    .map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }))
  const userContent = `上下文(JSON)：\n${JSON.stringify(context)}\n\n用户消息：${message}`
  const out = await llmMessagesJson(AGENT_SYSTEM, [...history, { role: 'user', content: userContent }], aiConfig)

  const performed = []
  const entities = []
  let planOut = null
  const rec = (kind, reason, type, id) => repos.captureRecords.create({
    rawInput: message, source: 'chat', aiKind: kind, confidence: 0.9,
    aiReason: (reason || '').slice(0, 160), resultEntityType: type, resultEntityId: id, status: 'ok',
  })

  const createTask = (t, reason) => {
    const task = repos.tasks.create({
      title: t.title, notes: t.notes || '', status: 'todo',
      tags: Array.isArray(t.tags) ? t.tags : [], context: '',
      dueAt: t.dueAt || detectDue(message) || null, plannedAt: null,
      durationMinutes: typeof t.durationMinutes === 'number' ? t.durationMinutes : 30,
      priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : 3,
      privacyScope: ['work', 'personal', 'mixed'].includes(t.privacyScope) ? t.privacyScope : 'work',
    })
    rec('task', reason, 'task', task.id)
    repos.activity.log(task.id, '任务已创建（来自聊天输入）')
    entities.push({ type: 'task', entity: task })
    performed.push({ type: 'create_task', id: task.id, title: task.title })
    return task
  }

  const rawActions = Array.isArray(out.actions) ? out.actions : (out.action ? [out.action] : [])
  for (const raw of rawActions.slice(0, 12)) {
    const a = normalizeAction(raw)
    if (!a) continue
    try {
      if (a.type === 'create_task') {
        if (a.payload.title) createTask(a.payload, out.reply || 'AI 创建任务')
      } else if (a.type === 'create_idea') {
        const i = a.payload
        if (!i.title) continue
        const idea = repos.ideas.create({
          title: i.title, rawText: message, status: 'clarifying',
          suggestedNextAction: i.suggestedNextAction || i.nextAction || '', aiReason: i.reason || out.reply || '',
          privacyScope: i.privacyScope || 'work', source: 'chat',
        })
        rec('todo_idea', idea.aiReason, 'todo_idea', idea.id)
        entities.push({ type: 'todo_idea', entity: idea })
        performed.push({ type: 'create_idea', id: idea.id, title: idea.title })
      } else if (a.type === 'create_non_todo') {
        const n = a.payload
        if (!n.title) continue
        const non = repos.nonTodos.create({
          title: n.title, summary: n.summary || '', rawText: message, reason: n.reason || out.reply || '',
          suggestedDestination: 'archive', privacyScope: n.privacyScope || 'work', source: 'chat',
        })
        rec('non_todo', non.reason, 'non_todo', non.id)
        entities.push({ type: 'non_todo', entity: non })
        performed.push({ type: 'create_non_todo', id: non.id, title: non.title })
      } else if (a.type === 'complete_task' && a.id) {
        if (repos.tasks.get(a.id)) {
          const task = repos.tasks.update(a.id, { status: 'done' })
          repos.activity.log(a.id, '通过聊天标记完成')
          performed.push({ type: 'complete_task', id: a.id, task })
        }
      } else if (a.type === 'update_task' && a.id && a.patch) {
        if (repos.tasks.get(a.id)) {
          const task = repos.tasks.update(a.id, a.patch)
          performed.push({ type: 'update_task', id: a.id, task })
        }
      } else if (a.type === 'delete_task' && a.id) {
        const t = repos.tasks.get(a.id)
        if (t) { repos.tasks.remove(a.id); performed.push({ type: 'delete_task', id: a.id, title: t.title }) }
      } else if (a.type === 'plan') {
        planOut = planNextBlock(visibleTasks).plan
        performed.push({ type: 'plan' })
      } else if (a.type === 'remember') {
        const note = a.payload.note || a.payload.title || a.payload.text || a.payload.content
        if (note && appendMemory(repos, note)) performed.push({ type: 'remember', note: String(note).slice(0, 80) })
      }
    } catch { /* skip malformed action */ }
  }

  let reply = (out.reply || '好的。').trim()

  // 诚实守卫：reply 声称已执行，但实际什么都没做 → 服务端兜底真执行，绝不让 AI 空口说白话。
  if (!entities.length && !performed.length) {
    const claimsCreate = /(已添加|已创建|已经?记(录|下)?|添加了|创建了|记下了|已加入|已帮你|已为你|加到.{0,6}(任务|清单|待办))/.test(reply)
    const claimsDone = /(已完成|已标记完成|标记为完成|完成了这|已删除|删除了)/.test(reply)
    if (claimsCreate) {
      const result = triageInputSync(message)
      const { entityType, entity } = persistCapture(repos, { result, text: message, source: 'chat' })
      entities.push({ type: entityType, entity, result })
      performed.push({ type: entityType === 'task' ? 'create_task' : entityType === 'todo_idea' ? 'create_idea' : 'create_non_todo', id: entity.id, title: entity.title, recovered: true })
    } else if (claimsDone) {
      const target = extractCommandTarget(message)
      const open = visibleTasks.filter((t) => t.status !== 'done' && t.status !== 'archived')
      const q = (target || '').toLowerCase()
      const hits = q ? open.filter((t) => t.title.toLowerCase() === q || t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())) : []
      if (hits.length === 1) {
        const task = repos.tasks.update(hits[0].id, { status: 'done' })
        repos.activity.log(hits[0].id, '通过聊天标记完成')
        performed.push({ type: 'complete_task', id: hits[0].id, task, recovered: true })
      } else {
        reply += '\n（提示：本次没有实际改动任何任务——请用更完整的任务标题再说一次。）'
      }
    }
  }

  if (planOut && planOut.length && !/\d\s*[.、]/.test(reply)) {
    reply += '\n' + planOut.map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`).join('\n')
  }

  const userMessage = repos.chat.create({ role: 'user', text: message })
  const agentMessage = repos.chat.create({ role: 'agent', text: reply })
  return { intent: 'agent', reply, entities, plan: planOut, performed, userMessage, agentMessage }
}
