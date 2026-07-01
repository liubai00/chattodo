import { detectIntent, triageInputSync } from './triage/index.js'
import { planNextBlock } from './planning.js'
import { visibleFilter } from './privacy.js'
import { persistCapture } from './capture.js'
import { agentChat } from './agentChat.js'

// Rule-based chat (offline): keyword intent → plan or rule-triage capture + template reply.
function ruleChat(repos, { message }) {
  const userMessage = repos.chat.create({ role: 'user', text: message })

  if (detectIntent(message) === 'plan') {
    const settings = repos.settings.get()
    const tasks = visibleFilter(repos.tasks.all(), settings)
    const { plan } = planNextBlock(tasks)
    const text = plan.length === 0
      ? '当前可见 todo 中没有可安排的任务。先添加几条任务，或切换隐私范围试试。'
      : `基于当前可见 todo，建议接下来这样安排：\n${plan.map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`).join('\n')}\n\n（已排除 NonTodo 隔离输出与隐私隐藏的任务）`
    const agentMessage = repos.chat.create({ role: 'agent', text })
    return { intent: 'plan', userMessage, agentMessage, plan }
  }

  const { result } = persistCapture(repos, { result: triageInputSync(message), text: message, source: 'chat' })
  const text =
    result.kind === 'task' ? `✅ 已进入 todo 主系统：${result.title}\n${result.reason}`
      : result.kind === 'todo_idea' ? `📥 已进入 Todo Inbox：${result.title}\n建议下一步：${result.suggestedNextAction}`
        : `◽️ 非 todo，已隔离输出：${result.title}\n原因：${result.reason}（未进入 todo 主系统）`
  const agentMessage = repos.chat.create({ role: 'agent', text })
  return { intent: 'capture', userMessage, agentMessage, result }
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
        const userMessage = repos.chat.create({ role: 'user', text: message })
        const agentMessage = repos.chat.create({ role: 'agent', text: 'AI 处理失败，请点重试。', isError: true })
        return { intent: 'agent', userMessage, agentMessage, error: err.message }
      }
      // fall through to rule chat
    }
  }
  return ruleChat(repos, { message })
}
