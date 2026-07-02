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

export function extractJson(s) {
  const m = String(s || '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('LLM 未返回 JSON：' + String(s).slice(0, 120))
  return JSON.parse(m[0])
}

// Incrementally pulls the leading "reply" string value out of streaming JSON
// (`{"reply":"…","actions":[…]}`), emitting decoded characters as they arrive.
// Handles \n \t \" \\ and \uXXXX escapes split across chunk boundaries.
export function makeReplyExtractor(onDelta) {
  let pre = ''
  let started = false
  let closed = false
  let pending = ''
  return (chunk) => {
    if (closed) return
    if (!started) {
      pre += chunk
      const m = pre.match(/"reply"\s*:\s*"/)
      if (!m) return
      started = true
      chunk = pre.slice(m.index + m[0].length)
      pre = ''
    }
    pending += chunk
    let out = ''
    let i = 0
    while (i < pending.length) {
      const c = pending[i]
      if (c === '\\') {
        if (i + 1 >= pending.length) break // escape split across chunks — wait
        const n = pending[i + 1]
        if (n === 'u') {
          if (i + 6 > pending.length) break
          const code = parseInt(pending.slice(i + 2, i + 6), 16)
          out += Number.isNaN(code) ? '' : String.fromCharCode(code)
          i += 6
        } else {
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '' : n
          i += 2
        }
      } else if (c === '"') {
        closed = true
        i++
        break
      } else {
        out += c
        i++
      }
    }
    pending = pending.slice(i)
    if (out) onDelta(out)
  }
}

// Streaming completion: calls onToken with each text delta, returns the full text.
export async function llmStreamText(system, messages, cfg, onToken) {
  const turns = normalizeTurns(messages)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), cfg.streamTimeoutMs || 60000)
  try {
    let url, headers, body, pick
    if (cfg.provider === 'anthropic') {
      const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
      url = `${base}/v1/messages`
      headers = { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
      body = { model: cfg.model, max_tokens: 1024, system, messages: turns, stream: true }
      pick = (j) => (j.type === 'content_block_delta' ? (j.delta?.text || '') : '')
    } else {
      url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`
      headers = { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` }
      body = { model: cfg.model, temperature: 0.2, messages: [{ role: 'system', content: system }, ...turns], stream: true }
      pick = (j) => j.choices?.[0]?.delta?.content || ''
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal })
    if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`)
    if (!res.body || !res.body.getReader) {
      // upstream didn't stream — degrade to one shot
      const text = await res.text()
      try { const j = JSON.parse(text); const t = cfg.provider === 'anthropic' ? (j.content?.[0]?.text || '') : (j.choices?.[0]?.message?.content || ''); if (t && onToken) onToken(t); return t } catch { return text }
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let full = ''
    let carry = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      carry += dec.decode(value, { stream: true })
      const lines = carry.split('\n')
      carry = lines.pop()
      for (const line of lines) {
        const s = line.trim()
        if (!s.startsWith('data:')) continue
        const payload = s.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const t = pick(JSON.parse(payload))
          if (t) { full += t; if (onToken) onToken(t) }
        } catch { /* partial frame */ }
      }
    }
    return full
  } finally {
    clearTimeout(timer)
  }
}

// Anthropic requires user-first, strictly alternating roles; OpenAI tolerates
// anything. Normalize once here so callers can pass raw history.
function normalizeTurns(messages) {
  const out = []
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const content = String(m.content || '').trim()
    if (!content) continue
    if (!out.length && role === 'assistant') continue // must start with user
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].content += '\n\n' + content // merge consecutive same-role
    } else {
      out.push({ role, content })
    }
  }
  return out.length ? out : [{ role: 'user', content: '（空）' }]
}

async function llmComplete(system, messages, cfg, signal) {
  const turns = normalizeTurns(messages)
  if (cfg.provider === 'anthropic') {
    const base = cfg.baseUrl || 'https://api.anthropic.com'
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1024, system, messages: turns }),
      signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()).content?.[0]?.text || ''
  }
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: 'system', content: system }, ...turns] }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI 兼容接口 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).choices?.[0]?.message?.content || ''
}

// Reusable: send system+user, get back a parsed JSON object. Used by triage.
export async function llmJson(system, user, cfg) {
  return llmMessagesJson(system, [{ role: 'user', content: user }], cfg)
}

// Multi-turn variant: full message history (user/assistant), JSON reply. Used by agent chat.
export async function llmMessagesJson(system, messages, cfg) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs || 25000)
  try {
    return extractJson(await llmComplete(system, messages, cfg, ac.signal))
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
