// @linx/platform-llm — 通用流式 LLM 传输层（承接 triage/llmProvider.js 的 transport 部分）。
// envelope-无关：只负责 anthropic(/v1/messages) 与 openai 兼容(/chat/completions) 的请求分派、
// SSE 行解析、无流降级、超时中断、user-first 归一。不认识 triage / {reply,actions} 信封
// （makeReplyExtractor 归 agent-chat-llm，mergeResult/TRIAGE 归 agent-triage-llm）。

export interface LlmConfig {
  /** 'anthropic' 走 messages API；其它一律 openai 兼容。 */
  provider: string
  baseUrl?: string
  apiKey?: string
  model: string
  /** 流式超时（默认 60s）。 */
  streamTimeoutMs?: number
  /** 非流式超时（默认 25s）。 */
  timeoutMs?: number
}

export interface Turn {
  role: string
  content: string
}

export interface LlmClient {
  /** 流式补全：每个文本增量回调 onToken，返回全文。 */
  streamText(system: string, messages: readonly Turn[], cfg: LlmConfig, onToken?: (t: string) => void): Promise<string>
  /** 非流式补全（可传 AbortSignal）。 */
  complete(system: string, messages: readonly Turn[], cfg: LlmConfig, signal?: AbortSignal): Promise<string>
  /** 非流式 + 自带超时。 */
  messagesText(system: string, messages: readonly Turn[], cfg: LlmConfig): Promise<string>
  /** 非流式 + 抽取 JSON 对象。 */
  messagesJson(system: string, messages: readonly Turn[], cfg: LlmConfig): Promise<unknown>
}

export interface LlmClientDeps {
  /** 注入 fetch 以便测试；默认全局 fetch。 */
  fetch?: typeof fetch
}

/** 从（可能夹带解释/代码块的）文本里贪婪抽取第一个 {..} JSON 对象。 */
export function extractJson(s: string): unknown {
  const m = String(s || '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('LLM 未返回 JSON：' + String(s).slice(0, 120))
  return JSON.parse(m[0])
}

/**
 * Anthropic 要求 user 先手、严格交替；OpenAI 宽松。此处统一归一：丢空、丢首个 assistant、
 * 合并连续同角色，空历史兜底为单条 user。
 */
export function normalizeTurns(messages: readonly Turn[]): Turn[] {
  const out: Turn[] = []
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const content = String(m.content || '').trim()
    if (!content) continue
    if (!out.length && role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += '\n\n' + content
    else out.push({ role, content })
  }
  return out.length ? out : [{ role: 'user', content: '（空）' }]
}

const trimSlash = (u: string): string => u.replace(/\/+$/, '')

/** openai 兼容必须显式 baseUrl（修 legacy：undefined.replace 崩溃）。 */
function openaiBase(cfg: LlmConfig): string {
  if (!cfg.baseUrl) throw new Error('openai 兼容 provider 需要配置 Base URL')
  return trimSlash(cfg.baseUrl)
}

interface RequestParts {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function buildRequest(system: string, turns: Turn[], cfg: LlmConfig, stream: boolean): RequestParts {
  if (cfg.provider === 'anthropic') {
    const base = trimSlash(cfg.baseUrl || 'https://api.anthropic.com')
    return {
      url: `${base}/v1/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      body: { model: cfg.model, max_tokens: 1024, system, messages: turns, ...(stream ? { stream: true } : {}) },
    }
  }
  return {
    url: `${openaiBase(cfg)}/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey ?? ''}` },
    body: {
      model: cfg.model,
      temperature: 0.2,
      messages: [{ role: 'system', content: system }, ...turns],
      ...(stream ? { stream: true } : {}),
    },
  }
}

function pickDelta(cfg: LlmConfig, j: Record<string, unknown>): string {
  if (cfg.provider === 'anthropic') {
    return j.type === 'content_block_delta' ? String((j.delta as { text?: string } | undefined)?.text ?? '') : ''
  }
  const choice = (j.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]
  return choice?.delta?.content ?? ''
}

function pickFull(cfg: LlmConfig, j: Record<string, unknown>): string {
  if (cfg.provider === 'anthropic') {
    return String((j.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? '')
  }
  return String((j.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content ?? '')
}

export function makeLlmClient(deps: LlmClientDeps = {}): LlmClient {
  const doFetch: typeof fetch = deps.fetch ?? fetch

  const complete = async (
    system: string,
    messages: readonly Turn[],
    cfg: LlmConfig,
    signal?: AbortSignal,
  ): Promise<string> => {
    const turns = normalizeTurns(messages)
    const { url, headers, body } = buildRequest(system, turns, cfg, false)
    const res = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
    if (!res.ok) {
      throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    return pickFull(cfg, (await res.json()) as Record<string, unknown>)
  }

  const messagesText = async (system: string, messages: readonly Turn[], cfg: LlmConfig): Promise<string> => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), cfg.timeoutMs ?? 25000)
    try {
      return await complete(system, messages, cfg, ac.signal)
    } finally {
      clearTimeout(timer)
    }
  }

  const streamText = async (
    system: string,
    messages: readonly Turn[],
    cfg: LlmConfig,
    onToken?: (t: string) => void,
  ): Promise<string> => {
    const turns = normalizeTurns(messages)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), cfg.streamTimeoutMs ?? 60000)
    try {
      const { url, headers, body } = buildRequest(system, turns, cfg, true)
      const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal })
      if (!res.ok) {
        throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }
      const reader = res.body?.getReader?.()
      if (!reader) {
        // 上游未流式 → 降级一次性
        const text = await res.text()
        try {
          const t = pickFull(cfg, JSON.parse(text) as Record<string, unknown>)
          if (t && onToken) onToken(t)
          return t
        } catch {
          return text
        }
      }
      const dec = new TextDecoder()
      let full = ''
      let carry = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        carry += dec.decode(value, { stream: true })
        const lines = carry.split('\n')
        carry = lines.pop() ?? ''
        for (const line of lines) {
          const s = line.trim()
          if (!s.startsWith('data:')) continue
          const payload = s.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const t = pickDelta(cfg, JSON.parse(payload) as Record<string, unknown>)
            if (t) {
              full += t
              if (onToken) onToken(t)
            }
          } catch {
            /* partial frame */
          }
        }
      }
      return full
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    streamText,
    complete,
    messagesText,
    async messagesJson(system, messages, cfg) {
      return extractJson(await messagesText(system, messages, cfg))
    },
  }
}
