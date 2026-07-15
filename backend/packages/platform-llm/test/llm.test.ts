import { describe, it, expect } from 'vitest'
import { makeLlmClient, extractJson, normalizeTurns, type LlmConfig } from '../src/index.js'

const enc = new TextEncoder()

/** 构造一个假的流式 Response：body.getReader() 逐块吐 SSE 文本。 */
function streamResponse(frames: string[], ok = true, status = 200): Response {
  let i = 0
  const body = {
    getReader() {
      return {
        async read(): Promise<{ done: boolean; value?: Uint8Array }> {
          if (i >= frames.length) return { done: true }
          return { done: false, value: enc.encode(frames[i++]!) }
        },
      }
    },
  }
  return { ok, status, body, async text() { return frames.join('') }, async json() { return JSON.parse(frames.join('')) } } as unknown as Response
}

/** 一次性（非流式）JSON Response，且 body 无 getReader（触发降级）。 */
function jsonResponse(obj: unknown, ok = true, status = 200): Response {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj)
  return { ok, status, body: {}, async text() { return text }, async json() { return JSON.parse(text) } } as unknown as Response
}

const anthropicCfg: LlmConfig = { provider: 'anthropic', apiKey: 'k', model: 'claude-x' }
const openaiCfg: LlmConfig = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'k', model: 'ds-x' }

describe('extractJson', () => {
  it('pulls the first {..} out of noisy text', () => {
    expect(extractJson('好的 ```json\n{"kind":"task","title":"x"}\n``` 完')).toEqual({ kind: 'task', title: 'x' })
  })
  it('throws when no object present', () => {
    expect(() => extractJson('no json here')).toThrow(/未返回 JSON/)
  })
})

describe('normalizeTurns', () => {
  it('drops leading assistant, merges consecutive same-role, drops empties', () => {
    expect(
      normalizeTurns([
        { role: 'assistant', content: '先手不能是我' },
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'user', content: '   ' },
        { role: 'assistant', content: 'c' },
      ]),
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
    ])
  })
  it('empty → single user placeholder', () => {
    expect(normalizeTurns([])).toEqual([{ role: 'user', content: '（空）' }])
  })
})

describe('streamText — anthropic', () => {
  it('parses content_block_delta frames, calls onToken, returns full', async () => {
    let captured: { url: string; body: unknown } | undefined
    const client = makeLlmClient({
      fetch: (async (url: string, init: RequestInit) => {
        captured = { url, body: JSON.parse(String(init.body)) }
        return streamResponse([
          'data: {"type":"content_block_delta","delta":{"text":"你好"}}\n',
          'data: {"type":"content_block_delta","delta":{"text":"，世界"}}\n',
          'data: [DONE]\n',
        ])
      }) as unknown as typeof fetch,
    })
    const tokens: string[] = []
    const full = await client.streamText('SYS', [{ role: 'user', content: 'hi' }], anthropicCfg, (t) => tokens.push(t))
    expect(full).toBe('你好，世界')
    expect(tokens).toEqual(['你好', '，世界'])
    expect(captured?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(captured?.body).toMatchObject({ model: 'claude-x', stream: true, system: 'SYS' })
  })

  it('handles a delta split across chunk boundaries', async () => {
    const client = makeLlmClient({
      fetch: (async () =>
        streamResponse([
          'data: {"type":"content_block_delta","delta":{"text":"a"}}\ndata: {"type":"con', // frame split
          'tent_block_delta","delta":{"text":"b"}}\n',
        ])) as unknown as typeof fetch,
    })
    expect(await client.streamText('S', [{ role: 'user', content: 'x' }], anthropicCfg)).toBe('ab')
  })
})

describe('streamText — openai compatible', () => {
  it('parses choices[].delta.content; builds /chat/completions with system-first', async () => {
    let captured: { url: string; body: { messages: { role: string }[] } } | undefined
    const client = makeLlmClient({
      fetch: (async (url: string, init: RequestInit) => {
        captured = { url, body: JSON.parse(String(init.body)) }
        return streamResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
          'data: [DONE]\n',
        ])
      }) as unknown as typeof fetch,
    })
    expect(await client.streamText('SYS', [{ role: 'user', content: 'hi' }], openaiCfg)).toBe('Hello')
    expect(captured?.url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(captured?.body.messages[0]).toEqual({ role: 'system', content: 'SYS' })
  })

  it('missing baseUrl for openai-compatible → throws (fixed from legacy crash)', async () => {
    const client = makeLlmClient({ fetch: (async () => streamResponse([])) as unknown as typeof fetch })
    await expect(
      client.streamText('S', [{ role: 'user', content: 'x' }], { provider: 'openai', apiKey: 'k', model: 'm' }),
    ).rejects.toThrow(/Base URL/)
  })
})

describe('streamText — degrade + errors', () => {
  it('no getReader → one-shot degrade emits full text once', async () => {
    const tokens: string[] = []
    const client = makeLlmClient({
      fetch: (async () => jsonResponse({ content: [{ text: '整段回复' }] })) as unknown as typeof fetch,
    })
    const full = await client.streamText('S', [{ role: 'user', content: 'x' }], anthropicCfg, (t) => tokens.push(t))
    expect(full).toBe('整段回复')
    expect(tokens).toEqual(['整段回复'])
  })

  it('non-ok response throws with provider+status', async () => {
    const client = makeLlmClient({
      fetch: (async () => streamResponse(['rate limited'], false, 429)) as unknown as typeof fetch,
    })
    await expect(client.streamText('S', [{ role: 'user', content: 'x' }], anthropicCfg)).rejects.toThrow(/anthropic 429/)
  })
})

describe('complete / messagesJson', () => {
  it('complete returns full text (anthropic)', async () => {
    const client = makeLlmClient({
      fetch: (async () => jsonResponse({ content: [{ text: 'done' }] })) as unknown as typeof fetch,
    })
    expect(await client.complete('S', [{ role: 'user', content: 'x' }], anthropicCfg)).toBe('done')
  })
  it('messagesJson parses the JSON envelope from openai content', async () => {
    const client = makeLlmClient({
      fetch: (async () => jsonResponse({ choices: [{ message: { content: '{"kind":"task"}' } }] })) as unknown as typeof fetch,
    })
    expect(await client.messagesJson('S', [{ role: 'user', content: 'x' }], openaiCfg)).toEqual({ kind: 'task' })
  })
})
