import { detectIntent, extractCommandTarget, triageInputSync } from './triage/index.js'
import { planNextBlock } from './planning.js'
import { visibleFilter } from './privacy.js'
import { persistCapture } from './capture.js'
import { agentChat, appendMemory } from './agentChat.js'

// Unified chat-turn result consumed by the frontend:
// { intent, reply, entities:[{type,entity}], plan|null, performed:[...], userMessage, agentMessage }
function finish(repos, { message, intent, reply, entities = [], plan = null, performed = [], isError = false }) {
  const userMessage = repos.chat.create({ role: 'user', text: message })
  const agentMessage = repos.chat.create({ role: 'agent', text: reply, isError })
  return { intent, reply, entities, plan, performed, userMessage, agentMessage }
}

const fmtDue = (iso) => {
  if (!iso) return '待定'
  const d = new Date(iso); const t = new Date()
  const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((sod(d) - sod(t)) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff < 0) return `已逾期 ${-diff} 天`
  if (diff <= 6) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const openTasksOf = (repos) => {
  const settings = repos.settings.get()
  return visibleFilter(repos.tasks.all(), settings).filter((t) => t.status !== 'done' && t.status !== 'archived')
}

// Fuzzy title match for complete/delete commands.
function matchTasks(tasks, target) {
  if (!target) return []
  const q = target.toLowerCase()
  const exact = tasks.filter((t) => t.title.toLowerCase() === q)
  if (exact.length) return exact
  return tasks.filter((t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase()))
}

const listLines = (tasks) => tasks.map((t, i) => `${i + 1}. ${t.title}（${fmtDue(t.dueAt)} · P${t.priority}）`).join('\n')

// Rule-based chat (offline): understands direct commands / questions and only
// captures real content — the "everything becomes a todo" behavior is gone.
function ruleChat(repos, { message }) {
  const intent = detectIntent(message)

  if (intent === 'greeting') {
    return finish(repos, { message, intent, reply: '你好，我在。把想法、任务直接丢给我，我来判断与整理；也可以问我「接下来做什么」，或说「把 XX 标记完成」。' })
  }

  if (intent === 'help') {
    return finish(repos, {
      message, intent,
      reply: '我是你的 todo-first 助理，你可以：\n1. 直接丢一句想法 → 我判断是任务 / 待澄清 / 非 todo 并归档；\n2. 问「接下来两小时做什么」→ 生成执行计划；\n3. 说「有哪些任务 / 今天到期的任务」→ 查询清单；\n4. 说「把 XX 标记完成」「删除 XX」→ 直接操作任务；\n5. 在设置 · AI 接入里配置真实模型后，我还能自然对话并代你操作。',
    })
  }

  if (intent === 'plan') {
    const settings = repos.settings.get()
    const tasks = visibleFilter(repos.tasks.all(), settings)
    const { plan } = planNextBlock(tasks)
    const reply = plan.length === 0
      ? '当前可见 todo 中没有可安排的任务。先添加几条任务，或切换隐私范围试试。'
      : `基于当前可见 todo，建议接下来这样安排：\n${plan.map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`).join('\n')}\n\n（已排除 NonTodo 隔离输出与隐私隐藏的任务）`
    return finish(repos, { message, intent, reply, plan })
  }

  if (intent === 'query') {
    const open = openTasksOf(repos)
    const m = message
    let list = open; let label = '未完成任务'
    const sod = (x) => { const d = new Date(x); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
    const today = sod(new Date())
    if (/(今天|今日)/.test(m)) { list = open.filter((t) => t.dueAt && sod(t.dueAt) === today); label = '今天到期' }
    else if (/(逾期|过期)/.test(m)) { list = open.filter((t) => t.dueAt && sod(t.dueAt) < today); label = '已逾期' }
    else if (/(本周|这周)/.test(m)) { list = open.filter((t) => t.dueAt && sod(t.dueAt) >= today && sod(t.dueAt) < today + 7 * 86400000); label = '本周到期' }
    else if (/完成/.test(m) && /(已|哪些)/.test(m)) {
      const settings = repos.settings.get()
      list = visibleFilter(repos.tasks.all(), settings).filter((t) => t.status === 'done'); label = '已完成'
    }
    const sorted = [...list].sort((a, b) => String(a.dueAt || '9999') < String(b.dueAt || '9999') ? -1 : 1).slice(0, 10)
    const reply = sorted.length === 0
      ? `${label}：暂时没有。${label === '已逾期' ? '很好，没有拖欠。' : ''}`
      : `${label} 共 ${list.length} 条${list.length > 10 ? '（只列前 10 条）' : ''}：\n${listLines(sorted)}`
    return finish(repos, { message, intent, reply })
  }

  if (intent === 'complete' || intent === 'delete') {
    const target = extractCommandTarget(message)
    const open = intent === 'complete' ? openTasksOf(repos) : (() => {
      const settings = repos.settings.get()
      return visibleFilter(repos.tasks.all(), settings).filter((t) => t.status !== 'archived')
    })()
    const hits = matchTasks(open, target)
    if (!target || hits.length === 0) {
      return finish(repos, { message, intent, reply: `没有找到标题匹配「${target || message}」的任务。可以先说「有哪些任务」看看清单，或换个更接近任务标题的说法。` })
    }
    if (hits.length > 1) {
      return finish(repos, { message, intent, reply: `找到 ${hits.length} 条相近的任务，说得再具体一点（用完整标题）：\n${listLines(hits.slice(0, 5))}` })
    }
    const t = hits[0]
    if (intent === 'complete') {
      const task = repos.tasks.update(t.id, { status: 'done' })
      repos.activity.log(t.id, '通过聊天标记完成')
      return finish(repos, { message, intent, reply: `✅ 已完成「${t.title}」。`, performed: [{ type: 'complete_task', id: t.id, task }] })
    }
    repos.tasks.remove(t.id)
    return finish(repos, { message, intent, reply: `🗑️ 已删除「${t.title}」。`, performed: [{ type: 'delete_task', id: t.id, title: t.title }] })
  }

  if (intent === 'remember') {
    const note = message.replace(/^记住[:：，,\s]*/, '').trim() || message
    appendMemory(repos, note)
    return finish(repos, { message, intent, reply: `🧠 已写入长期记忆：「${note.slice(0, 60)}」。之后判断与规划会参考它（可在 Agent 配置 · 记忆 中查看和修改）。`, performed: [{ type: 'remember', note: note.slice(0, 80) }] })
  }

  if (intent === 'question') {
    return finish(repos, {
      message, intent,
      reply: '这更像一个问题，我没有把它记成待办。规则模式下我不擅长开放问答 — 在 设置 · AI 接入 配置真实模型后我可以直接回答；如果它其实是件要做的事，可以说「帮我记：…」。',
    })
  }

  // capture: real content → triage → route into the todo system
  const { result, entityType, entity } = persistCapture(repos, { result: triageInputSync(message), text: message, source: 'chat' })
  const reply =
    result.kind === 'task' ? `✅ 已进入 todo 主系统：${result.title}\n${result.reason}`
      : result.kind === 'todo_idea' ? `📥 已进入待澄清区：${result.title}\n建议下一步：${result.suggestedNextAction}`
        : `◽️ 非 todo，已隔离输出：${result.title}\n原因：${result.reason}（未进入 todo 主系统）`
  return finish(repos, { message, intent: 'capture', reply, entities: [{ type: entityType, entity, result }] })
}

// One chat turn. Model-driven when an LLM is configured; rule-based otherwise
// (or as a fallback when the LLM call fails and fallbackToRule is on).
export async function chat(repos, { message }) {
  const aiConfig = repos.aiConfig?.get?.() || null
  const useLlm = aiConfig && aiConfig.provider !== 'rule' && aiConfig.apiKey

  if (useLlm) {
    try {
      return await agentChat(repos, { message, aiConfig })
    } catch (err) {
      repos.aiErrors.create({ rawInput: message, message: err.message })
      if (aiConfig.fallbackToRule === false) {
        return finish(repos, { message, intent: 'agent', reply: 'AI 处理失败，请点重试。', isError: true })
      }
      // fall through to rule chat
    }
  }
  return ruleChat(repos, { message })
}
