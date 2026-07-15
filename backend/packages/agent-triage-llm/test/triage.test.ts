import { describe, it, expect } from 'vitest'
import type { LlmClient, LlmConfig, Turn } from '@linx/platform-llm'
import { makeTriageService, mergeResult, TRIAGE_SYSTEM } from '../src/index.js'

const NOW = new Date('2026-07-15T09:00:00').getTime()

/** 假 LlmClient：messagesJson 返回预置对象，并记录收到的 system/turns/cfg。 */
function fakeLlm(json: unknown): { llm: LlmClient; calls: { system: string; turns: readonly Turn[]; cfg: LlmConfig }[] } {
  const calls: { system: string; turns: readonly Turn[]; cfg: LlmConfig }[] = []
  const llm: LlmClient = {
    async messagesJson(system, turns, cfg) {
      calls.push({ system, turns, cfg })
      return json
    },
    async messagesText() {
      return ''
    },
    async streamText() {
      return ''
    },
    async complete() {
      return ''
    },
  }
  return { llm, calls }
}

describe('mergeResult', () => {
  it('task: keeps LLM classification but dueAt from rule detectDue', () => {
    const r = mergeResult('明天下午3点前交方案', { kind: 'task', title: '交方案', priority: 2, durationMinutes: 45, privacyScope: 'work' }, NOW)
    expect(r).toMatchObject({ kind: 'task', title: '交方案', priority: 2, durationMinutes: 45, privacyScope: 'work', context: '电脑前' })
    expect(r.kind === 'task' && r.dueAt).toBeTruthy() // detectDue filled
  })
  it('whitelists bad discriminants to safe defaults', () => {
    const r = mergeResult('随便说说', { kind: 'garbage', priority: 9, privacyScope: 'weird' }, NOW)
    expect(r.kind).toBe('non_todo') // bad kind → non_todo
    expect(['work', 'personal', 'mixed']).toContain(r.privacyScope)
  })
  it('todo_idea default next action', () => {
    const r = mergeResult('周末研究下 X', { kind: 'todo_idea', title: '研究 X' }, NOW)
    expect(r).toMatchObject({ kind: 'todo_idea', suggestedNextAction: '明确目标、下一步与完成标准。' })
  })
  it('non_todo default summary + destination whitelist', () => {
    const r = mergeResult('可以借鉴 Cubox', { kind: 'non_todo', suggestedDestination: 'nonsense' }, NOW)
    expect(r).toMatchObject({ kind: 'non_todo', suggestedDestination: 'archive' })
  })
})

describe('makeTriageService selector', () => {
  const cfgLlm: LlmConfig & { apiKey: string } = { provider: 'anthropic', apiKey: 'k', model: 'claude' }

  it('uses LLM when provider!=rule && apiKey', async () => {
    const { llm, calls } = fakeLlm({ kind: 'task', title: 'LLM给的标题' })
    const svc = makeTriageService({ llm, now: () => NOW })
    const r = await svc.triageInput('交方案', cfgLlm)
    expect(r.title).toBe('LLM给的标题')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.system).toBe(TRIAGE_SYSTEM)
    expect(calls[0]!.turns).toEqual([{ role: 'user', content: '交方案' }])
  })

  it('falls back to rule when no config / provider=rule / no key', async () => {
    const { llm, calls } = fakeLlm({ kind: 'task' })
    const svc = makeTriageService({ llm, now: () => NOW })
    await svc.triageInput('下周三前提交 MVP 文档评审', null)
    await svc.triageInput('x', { provider: 'rule', apiKey: 'k', model: 'm' })
    await svc.triageInput('y', { provider: 'anthropic', model: 'm' }) // no apiKey
    expect(calls).toHaveLength(0) // never touched the LLM
  })

  it('LLM errors propagate (fallback policy lives in consumer)', async () => {
    const llm: LlmClient = {
      async messagesJson() {
        throw new Error('anthropic 429')
      },
      async messagesText() {
        return ''
      },
      async streamText() {
        return ''
      },
      async complete() {
        return ''
      },
    }
    await expect(makeTriageService({ llm, now: () => NOW }).triageInput('x', cfgLlm)).rejects.toThrow(/429/)
  })
})
