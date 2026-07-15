import { describe, it, expect } from 'vitest'
import {
  decisionOf,
  rawMentionNames,
  summarizeMentions,
  stripInviteClaims,
  parseAutoRule,
  INVITE_COOLDOWN_MS,
  type Mention,
} from '../src/index.js'

describe('decisionOf', () => {
  it('maps modes to statuses', () => {
    expect(decisionOf('accept')).toBe('accepted')
    expect(decisionOf('decline')).toBe('declined')
    expect(decisionOf('follow')).toBe('following')
  })
})

describe('INVITE_COOLDOWN_MS', () => {
  it('is 24h', () => {
    expect(INVITE_COOLDOWN_MS).toBe(24 * 3600_000)
  })
})

describe('rawMentionNames', () => {
  it('extracts unique @names, stops at punctuation', () => {
    expect(rawMentionNames('麻烦 @张伟 和 @李雷 看下，@张伟 再确认')).toEqual(['张伟', '李雷'])
  })
  it('empty / no mention → []', () => {
    expect(rawMentionNames('')).toEqual([])
    expect(rawMentionNames('没有提及任何人')).toEqual([])
  })
})

describe('summarizeMentions', () => {
  it('groups person/time/doc', () => {
    const mentions: Mention[] = [
      { type: 'person', label: '张伟' },
      { type: 'time', label: '周五', iso: '2026-07-17T18:00:00' },
      { type: 'doc', label: 'MVP 文档', entityType: 'task' },
      { type: 'doc', label: '灵信', entityType: 'project' },
    ]
    const out = summarizeMentions(mentions)
    expect(out).toContain('人（成员')
    expect(out).toContain('张伟')
    expect(out).toContain('时间')
    expect(out).toContain('周五')
    expect(out).toContain('任务《MVP 文档》')
    expect(out).toContain('项目《灵信》')
  })
  it('empty → ""', () => {
    expect(summarizeMentions([])).toBe('')
    expect(summarizeMentions(undefined)).toBe('')
  })
})

describe('parseAutoRule', () => {
  it('parses "以后…类的任务都邀请…"', () => {
    expect(parseAutoRule('以后合同类的任务都邀请张伟')).toEqual({ keyword: '合同', name: '张伟' })
  })
  it('strips 所有/全部 prefix from keyword', () => {
    expect(parseAutoRule('以后所有合同相关的任务记得叫上李雷')).toEqual({ keyword: '合同', name: '李雷' })
  })
  it('no rule → null', () => {
    expect(parseAutoRule('随便说说')).toBeNull()
    expect(parseAutoRule('')).toBeNull()
  })
})

describe('stripInviteClaims', () => {
  it('removes a strong "已邀请" claim line', () => {
    const out = stripInviteClaims('好的，我已邀请张伟协作。')
    expect(out).not.toContain('已邀请张伟')
  })
  it('keeps task-only lines even if they contain 协作', () => {
    const line = '这个任务是关于团队协作平台的设计。'
    expect(stripInviteClaims(line)).toBe(line)
  })
  it('strips only the offending clause, keeps the rest of the line', () => {
    const out = stripInviteClaims('任务已创建，并已通知对方处理。')
    expect(out).toContain('任务已创建')
    expect(out).not.toContain('已通知对方')
  })
  it('weak collab verb + person (大家一起处理) is stripped', () => {
    // COLLAB(一起处理) + PRON(大家) → isClaim true → 剥离
    expect(stripInviteClaims('建议大家一起处理这批工单。')).not.toContain('一起处理')
  })
  it('weak collab verb WITHOUT a person is kept', () => {
    // "一起梳理" 不在 COLLAB 的"一起(做|干|完成|参与|处理|推进)"里，且无人称 → 保留
    const line = '接下来一起梳理下需求。'
    expect(stripInviteClaims(line)).toBe(line)
  })
  it('empty → ""', () => {
    expect(stripInviteClaims('')).toBe('')
  })
})
