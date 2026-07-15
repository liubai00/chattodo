import { describe, it, expect } from 'vitest'
import { isIdentityQuestion, identityReply, appendMemory, type ChatAgentRepo } from '../src/index.js'

describe('isIdentityQuestion', () => {
  it('detects short self-referential model questions', () => {
    expect(isIdentityQuestion('你是什么模型')).toBe(true)
    expect(isIdentityQuestion('你是谁')).toBe(true)
    expect(isIdentityQuestion('你叫什么')).toBe(true)
    expect(isIdentityQuestion('哪个模型驱动的你')).toBe(true)
  })
  it('does NOT misfire on normal tasks mentioning 模型', () => {
    expect(isIdentityQuestion('买个高达模型的手办送朋友')).toBe(false)
    expect(isIdentityQuestion('下周三前提交模型评审文档给团队看')).toBe(false) // 长句
  })
})

describe('identityReply', () => {
  it('offline mode when provider=rule / no key', () => {
    expect(identityReply(null)).toContain('离线规则模式')
    expect(identityReply({ provider: 'rule' })).toContain('离线规则模式')
  })
  it('names the model + host when configured', () => {
    expect(identityReply({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' })).toContain('claude-x')
    expect(identityReply({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' })).toContain('Anthropic 官方接口')
    const r = identityReply({ provider: 'deepseek', apiKey: 'k', model: 'ds', baseUrl: 'https://api.deepseek.com/v1' })
    expect(r).toContain('api.deepseek.com')
  })
})

describe('appendMemory', () => {
  it('prepends dated bullet, caps at 200 per note, trims blob to 1600', async () => {
    let stored = ''
    const agent: ChatAgentRepo = {
      async get() {
        return { memory: stored }
      },
      async update(patch) {
        stored = patch.memory ?? ''
        return undefined
      },
    }
    const clock = (): Date => new Date('2026-07-15T09:00:00')
    await appendMemory(agent, '偏好晨间规划', clock)
    expect(stored).toBe('· [7/15] 偏好晨间规划')
    await appendMemory(agent, '喜欢简洁回复', clock)
    expect(stored).toBe('· [7/15] 偏好晨间规划\n· [7/15] 喜欢简洁回复')
    // 空 note 不写
    await appendMemory(agent, '   ', clock)
    expect(stored).toBe('· [7/15] 偏好晨间规划\n· [7/15] 喜欢简洁回复')
  })

  it('trims to last 1600 chars aligned to a bullet', async () => {
    let stored = '·' + 'x'.repeat(1590) // 接近上限
    const agent: ChatAgentRepo = {
      async get() {
        return { memory: stored }
      },
      async update(patch) {
        stored = patch.memory ?? ''
        return undefined
      },
    }
    await appendMemory(agent, '新记忆', () => new Date('2026-07-15T09:00:00'))
    expect(stored.length).toBeLessThanOrEqual(1600)
    expect(stored.startsWith('·')).toBe(true)
    expect(stored).toContain('新记忆')
  })
})
