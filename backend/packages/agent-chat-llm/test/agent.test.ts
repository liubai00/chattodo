import { describe, it, expect } from 'vitest'
import type { LlmClient } from '@linx/platform-llm'
import { makeAgentChatApp, normalizeAction, makeReplyExtractor, type AgentChatDeps } from '../src/index.js'

describe('normalizeAction', () => {
  it('coerces string / aliases / nested / single-key forms', () => {
    expect(normalizeAction('done')).toMatchObject({ type: 'complete_task' })
    expect(normalizeAction({ action: 'add_task', title: '写周报' })).toMatchObject({ type: 'create_task', payload: { title: '写周报' } })
    expect(normalizeAction({ type: 'create_task', task: { title: '嵌套标题' } })).toMatchObject({ type: 'create_task', payload: { title: '嵌套标题' } })
    expect(normalizeAction({ create_task: { title: '单键' } })).toMatchObject({ type: 'create_task', payload: { title: '单键' } })
    expect(normalizeAction({ type: 'mark_done', id: 't1' })).toMatchObject({ type: 'complete_task', id: 't1' })
    expect(normalizeAction({ type: 'unknown_thing' })).toBeNull()
  })
})

describe('makeReplyExtractor', () => {
  it('decodes reply chars incrementally incl. escapes across chunk boundaries', () => {
    const chunks: string[] = []
    const feed = makeReplyExtractor((t) => chunks.push(t))
    // JSON: {"reply":"你好\n世界","actions":[]}  — 分块喂，转义跨块
    feed('{"reply":"你好')
    feed('\\n世') // 反斜杠+n 跨在这块
    feed('界","actions":[]}')
    expect(chunks.join('')).toBe('你好\n世界')
  })
  it('stops at the closing quote, ignores actions tail', () => {
    const chunks: string[] = []
    const feed = makeReplyExtractor((t) => chunks.push(t))
    feed('{"reply":"完成","actions":[{"type":"x"}]}')
    expect(chunks.join('')).toBe('完成')
  })
})

// —— 最小假依赖 ——
function fakeDeps(llmJson: string, over: Partial<AgentChatDeps> = {}): { deps: AgentChatDeps; created: Record<string, unknown>[]; getCaptureCalls: () => number } {
  const created: Record<string, unknown>[] = []
  let captureCalls = 0
  const llm: LlmClient = {
    async messagesText() {
      return llmJson
    },
    async streamText(_s, _t, _c, onToken) {
      if (onToken) onToken(llmJson)
      return llmJson
    },
    async messagesJson() {
      return JSON.parse(llmJson)
    },
    async complete() {
      return llmJson
    },
  }
  const deps: AgentChatDeps = {
    llm,
    settings: { async get() { return { privacyMode: false, workspaceMode: 'work' } } },
    tasks: {
      async all() { return [] },
      async get() { return undefined },
      async update(id, patch) { return { id, title: 't', status: 'todo', priority: 3, ...patch } as never },
      async remove() {},
      async create(input) { created.push(input); return { id: 'task_1', title: String(input.title), status: 'todo', priority: 3, notes: '' } },
    },
    ideas: { async all() { return [] }, async create(i) { return { id: 'idea_1', title: String(i.title), aiReason: '' } } },
    nonTodos: { async create(n) { return { id: 'non_1', title: String(n.title), reason: '' } } },
    projects: { async all() { return [] }, async get() { return undefined } },
    projectIdForText: async () => null,
    agent: { async get() { return {} }, async update() { return undefined } },
    chat: { async all() { return [] }, async create(d) { return { id: 'm', ...d } } },
    captureRecords: { async create() { return {} } },
    activity: { async log() {} },
    collaborators: { async myPending() { return [] } },
    capture: {
      async capture() {
        captureCalls++
        return { result: { kind: 'task' }, entityType: 'task', entity: { id: 'rec_1', title: '兜底任务' } }
      },
    },
    tasksApp: { async convertIdea() { return null } },
    teamNames: async () => [],
    clock: () => new Date('2026-07-15T09:00:00'),
    ...over,
  }
  return { deps, created, getCaptureCalls: () => captureCalls }
}

describe('agentChat turn', () => {
  it('executes create_task action → task entity + performed + persisted messages', async () => {
    const { deps, created } = fakeDeps('{"reply":"好的，已记为任务。","actions":[{"type":"create_task","title":"写周报","priority":2}]}')
    const res = await makeAgentChatApp(deps)({ message: '帮我记个写周报', aiConfig: { provider: 'anthropic', apiKey: 'k', model: 'claude' } })
    expect(res.intent).toBe('agent')
    expect(res.reply).toContain('已记为任务')
    expect(res.entities[0]).toMatchObject({ type: 'task' })
    expect(res.performed[0]).toMatchObject({ type: 'create_task', id: 'task_1' })
    expect(created[0]).toMatchObject({ title: '写周报', priority: 2, status: 'todo' })
  })

  it('plain-text (no JSON) reply → treated as reply, actions empty (chitchat)', async () => {
    const { deps } = fakeDeps('我是 LinX 助理，很高兴为你服务。')
    const res = await makeAgentChatApp(deps)({ message: '你好呀', aiConfig: { provider: 'anthropic', apiKey: 'k', model: 'claude' } })
    expect(res.reply).toContain('LinX')
    expect(res.entities).toHaveLength(0)
    expect(res.performed).toHaveLength(0)
  })

  it('honesty guard: reply claims 已创建 but no actions → server recovers via capture', async () => {
    const holder = fakeDeps('{"reply":"已创建好这个任务，记得按时完成！","actions":[]}')
    const res = await makeAgentChatApp(holder.deps)({ message: '买牛奶', aiConfig: { provider: 'anthropic', apiKey: 'k', model: 'claude' } })
    expect(holder.getCaptureCalls()).toBe(1) // 兜底真执行
    expect(res.entities[0]).toMatchObject({ type: 'task' })
    expect((res.performed[0] as { recovered?: boolean }).recovered).toBe(true)
  })

  it('streaming path feeds reply deltas via onEvent', async () => {
    const { deps } = fakeDeps('{"reply":"流式回复内容","actions":[]}')
    const deltas: string[] = []
    await makeAgentChatApp(deps)({ message: 'x', aiConfig: { provider: 'anthropic', apiKey: 'k', model: 'claude' }, onEvent: (e) => { if (e.type === 'delta') deltas.push(e.text) } })
    expect(deltas.join('')).toBe('流式回复内容')
  })
})
