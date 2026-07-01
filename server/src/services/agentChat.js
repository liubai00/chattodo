import { llmJson } from './triage/llmProvider.js'
import { planNextBlock } from './planning.js'
import { visibleFilter } from './privacy.js'
import { detectDue } from './triage/ruleProvider.js'
import { nowIso } from '../lib/ids.js'

const AGENT_SYSTEM = `你是用户的 todo-first 智能助理。读懂用户意图，决定要执行的操作，并给出简洁、自然的中文回复。
可用动作（放进 actions 数组，可为空、可多个）：
- create_task {title, dueAt(ISO字符串或null), priority(1-4), durationMinutes(数字或null), tags(字符串数组), privacyScope(work|personal|mixed), notes}
- create_idea {title, suggestedNextAction, privacyScope}   // 有行动倾向但需澄清
- create_non_todo {title, summary, privacyScope}           // 只是想法/参考/摘录
- complete_task {id}                                        // 标记完成，id 用上下文里的任务 id
- update_task {id, patch}                                   // 修改字段，如 {priority:1} 或 {title:"..."}
- plan {}                                                   // 用户问"接下来做什么/两小时安排"时
判断原则：真正可执行→create_task；模糊→create_idea；非行动信息→create_non_todo。可结合上下文里的已有任务做 complete/update/plan。
必须严格只输出一个 JSON 对象：{"reply":"给用户的自然语言回复","actions":[...]}，不要输出多余文字或代码块。`

// Model-driven chat: the LLM reads intent → returns {reply, actions}; we execute
// the actions against the todo DB (with generation records) and reply naturally.
export async function agentChat(repos, { message, aiConfig }) {
  const settings = repos.settings.get()
  const visibleTasks = visibleFilter(repos.tasks.all(), settings)
  const profile = repos.agent.get()
  const context = {
    now: nowIso(),
    workspaceMode: settings.workspaceMode,
    privacyMode: settings.privacyMode,
    agent: { soul: profile.soul, preferences: profile.preferences, workingStyle: profile.workingStyle },
    openTasks: visibleTasks
      .filter((t) => t.status !== 'done' && t.status !== 'archived')
      .slice(0, 40)
      .map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority })),
  }
  const userContent = `上下文(JSON)：\n${JSON.stringify(context)}\n\n用户消息：${message}`
  const out = await llmJson(AGENT_SYSTEM, userContent, aiConfig)

  const performed = []
  const rec = (kind, reason, type, id) => repos.captureRecords.create({
    rawInput: message, source: 'chat', aiKind: kind, confidence: 0.9,
    aiReason: (reason || '').slice(0, 160), resultEntityType: type, resultEntityId: id, status: 'ok',
  })

  const actions = Array.isArray(out.actions) ? out.actions.slice(0, 12) : []
  for (const a of actions) {
    try {
      if (a.type === 'create_task') {
        const t = a.task || a
        if (!t.title) continue
        const task = repos.tasks.create({
          title: t.title, notes: t.notes || '', status: 'todo',
          tags: Array.isArray(t.tags) ? t.tags : [], context: '',
          dueAt: t.dueAt || detectDue(message) || null, plannedAt: null,
          durationMinutes: typeof t.durationMinutes === 'number' ? t.durationMinutes : 30,
          priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : 3,
          privacyScope: ['work', 'personal', 'mixed'].includes(t.privacyScope) ? t.privacyScope : 'work',
        })
        rec('task', out.reply || 'AI 创建任务', 'task', task.id)
        performed.push({ type: 'create_task', id: task.id, title: task.title })
      } else if (a.type === 'create_idea') {
        const i = a.idea || a
        if (!i.title) continue
        const idea = repos.ideas.create({
          title: i.title, rawText: message, status: 'clarifying',
          suggestedNextAction: i.suggestedNextAction || '', aiReason: i.reason || out.reply || '',
          privacyScope: i.privacyScope || 'work', source: 'chat',
        })
        rec('todo_idea', idea.aiReason, 'todo_idea', idea.id)
        performed.push({ type: 'create_idea', id: idea.id, title: idea.title })
      } else if (a.type === 'create_non_todo') {
        const n = a.nonTodo || a
        if (!n.title) continue
        const non = repos.nonTodos.create({
          title: n.title, summary: n.summary || '', rawText: message, reason: n.reason || out.reply || '',
          suggestedDestination: 'archive', privacyScope: n.privacyScope || 'work', source: 'chat',
        })
        rec('non_todo', non.reason, 'non_todo', non.id)
        performed.push({ type: 'create_non_todo', id: non.id, title: non.title })
      } else if (a.type === 'complete_task' && a.id) {
        if (repos.tasks.get(a.id)) { repos.tasks.update(a.id, { status: 'done' }); performed.push({ type: 'complete_task', id: a.id }) }
      } else if (a.type === 'update_task' && a.id && a.patch) {
        if (repos.tasks.get(a.id)) { repos.tasks.update(a.id, a.patch); performed.push({ type: 'update_task', id: a.id }) }
      } else if (a.type === 'plan') {
        performed.push({ type: 'plan', plan: planNextBlock(visibleTasks).plan })
      }
    } catch { /* skip malformed action */ }
  }

  let reply = (out.reply || '好的。').trim()
  const planAct = performed.find((p) => p.type === 'plan')
  if (planAct && planAct.plan?.length && !/\d\s*[.、]/.test(reply)) {
    reply += '\n' + planAct.plan.map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`).join('\n')
  }

  const userMessage = repos.chat.create({ role: 'user', text: message })
  const agentMessage = repos.chat.create({ role: 'agent', text: reply })
  return { intent: 'agent', userMessage, agentMessage, actions: performed }
}
