import { detectDue, detectScope, makeTitle } from './ruleProvider.js'

// Talks to any OpenAI-compatible endpoint (OpenAI, DeepSeek, 通义/Qwen, 豆包, Kimi,
// Azure, ...) or Anthropic's messages API. Exposes a reusable JSON-completion helper.

const TRIAGE_SYSTEM = `你是一个「todo-first」分类器。把用户输入判定为三类之一并只输出 JSON（不要解释、不要代码块）：
- task：有明确行动且可执行（有动作动词，通常有交付物或时间）。
- todo_idea：有行动倾向但缺目标/下一步/完成标准，需要澄清。
- non_todo：只是观点、灵感、摘录、参考，没有行动承诺。
输出字段：
{"kind":"task|todo_idea|non_todo","title":"<=24字标题","reason":"判定理由","confidence":0~1,"privacyScope":"work|personal|mixed",
 "priority":1-4(仅task),"tags":["..."](仅task),"durationMinutes":数字或null(仅task),
 "suggestedNextAction":"建议下一步(仅todo_idea)","summary":"摘要(仅non_todo)","suggestedDestination":"archive|copy|export|discard(仅non_todo)"}
只返回一个 JSON 对象。`

function extractJson(s) {
  const m = String(s || '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('LLM 未返回 JSON：' + String(s).slice(0, 120))
  return JSON.parse(m[0])
}

async function llmComplete(system, user, cfg, signal) {
  if (cfg.provider === 'anthropic') {
    const base = cfg.baseUrl || 'https://api.anthropic.com'
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
      signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()).content?.[0]?.text || ''
  }
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI 兼容接口 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).choices?.[0]?.message?.content || ''
}

// Reusable: send system+user, get back a parsed JSON object. Used by triage and agent chat.
export async function llmJson(system, user, cfg) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs || 25000)
  try {
    return extractJson(await llmComplete(system, user, cfg, ac.signal))
  } finally {
    clearTimeout(timer)
  }
}

// Merge the LLM's classification with deterministic fields (dates stay rule-based).
export function mergeResult(text, llm) {
  const kind = ['task', 'todo_idea', 'non_todo'].includes(llm.kind) ? llm.kind : 'non_todo'
  const scope = ['work', 'personal', 'mixed'].includes(llm.privacyScope) ? llm.privacyScope : detectScope(text)
  const common = {
    kind,
    title: llm.title || makeTitle(text),
    reason: llm.reason || '',
    confidence: typeof llm.confidence === 'number' ? llm.confidence : 0.8,
    privacyScope: scope,
  }
  if (kind === 'task') {
    return {
      ...common,
      dueAt: llm.dueAt || detectDue(text),
      plannedAt: null,
      durationMinutes: typeof llm.durationMinutes === 'number' ? llm.durationMinutes : null,
      priority: [1, 2, 3, 4].includes(llm.priority) ? llm.priority : 3,
      tags: Array.isArray(llm.tags) ? llm.tags : [],
      context: scope === 'work' ? '电脑前' : '任意',
    }
  }
  if (kind === 'todo_idea') {
    return { ...common, suggestedNextAction: llm.suggestedNextAction || '明确目标、下一步与完成标准。' }
  }
  return {
    ...common,
    summary: llm.summary || (text.length > 60 ? text.slice(0, 58) + '…' : text),
    suggestedDestination: ['archive', 'copy', 'export', 'discard'].includes(llm.suggestedDestination) ? llm.suggestedDestination : 'archive',
  }
}

export function makeLlmProvider(cfg) {
  return {
    name: cfg.provider,
    async triageInput(text) {
      return mergeResult(text, await llmJson(TRIAGE_SYSTEM, text, cfg))
    },
  }
}
