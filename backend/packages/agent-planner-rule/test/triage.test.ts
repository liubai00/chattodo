import { describe, it, expect } from 'vitest'
import {
  triageInputSync,
  detectIntent,
  parseTaskCommand,
  extractCommandTarget,
  splitSegments,
  makeTitle,
  detectScope,
} from '../src/index.js'

const NOW = new Date('2026-07-15T09:00:00').getTime()

describe('triageInputSync', () => {
  it('classifies an actionable + dated input as task', () => {
    const r = triageInputSync('下周三前提交 MVP 文档评审', NOW)
    expect(r.kind).toBe('task')
    if (r.kind === 'task') {
      expect(r.dueAt).not.toBeNull()
      expect(r.privacyScope).toBe('work')
      expect(r.tags).toContain('工作')
    }
  })
  it('classifies a vague research (no date) input as todo_idea', () => {
    // 注：'周末研究一下 Cubox' 因 '周末' 命中周历 → 有 due + 动作词 → task（与现网一致）。
    // 无日期的模糊行动才是 todo_idea。
    const r = triageInputSync('研究一下 Cubox', NOW)
    expect(r.kind).toBe('todo_idea')
  })
  it('classifies a reference/idea input as non_todo', () => {
    const r = triageInputSync('可以借鉴 Cubox 的稍后读', NOW)
    expect(r.kind).toBe('non_todo')
  })
  it('time-anchored commitment without action verb → task', () => {
    const r = triageInputSync('明天晚上八点去吃饭', NOW)
    expect(r.kind).toBe('task')
  })
  it('bare non-actionable text → non_todo', () => {
    expect(triageInputSync('今天天气不错', NOW).kind).toBe('non_todo')
  })
})

describe('detectScope / makeTitle', () => {
  it('scope work/personal/mixed', () => {
    expect(detectScope('写 MVP 文档')).toBe('work')
    expect(detectScope('陪孩子去医院')).toBe('personal')
    expect(detectScope('和老板去医院探望')).toBe('mixed')
  })
  it('makeTitle truncates >24', () => {
    expect(makeTitle('a'.repeat(30))).toBe('a'.repeat(22) + '…')
    expect(makeTitle('  短  标题 ')).toBe('短 标题')
  })
})

describe('detectIntent', () => {
  const cases: Array<[string, string]> = [
    ['你好啊', 'greeting'],
    ['你能做什么', 'help'],
    ['记住：我习惯上午做深度工作', 'remember'],
    ['接下来两小时做什么', 'plan'],
    ['有哪些待办', 'query'],
    ['把周报标记完成', 'complete'],
    ['删掉周报', 'delete'],
    ['为什么天是蓝的？', 'question'],
    ['帮我记一下买牛奶', 'capture'],
    ['买点牛奶', 'capture'],
    ['把周报改到明天', 'modify'],
  ]
  it.each(cases)('%s → %s', (msg, intent) => {
    expect(detectIntent(msg)).toBe(intent)
  })
})

describe('parseTaskCommand', () => {
  it('title / priority / status / due', () => {
    expect(parseTaskCommand('把周报改名为季度总结')).toEqual({ op: 'title', target: '周报', value: '季度总结' })
    expect(parseTaskCommand('把周报设为P1')).toEqual({ op: 'priority', target: '周报', value: 1 })
    expect(parseTaskCommand('把周报改成高优先级')).toEqual({ op: 'priority', target: '周报', value: 1 })
    expect(parseTaskCommand('把周报开始执行')).toEqual({ op: 'status', target: '周报', value: 'in_progress' })
    const due = parseTaskCommand('把周报改到明天', NOW)
    expect(due?.op).toBe('due')
    expect(due?.target).toBe('周报')
  })
  it('returns null for a normal new-task input', () => {
    expect(parseTaskCommand('开始健身')).toBeNull()
  })
})

describe('extractCommandTarget / splitSegments', () => {
  it('extracts the target from complete/delete commands', () => {
    expect(extractCommandTarget('把「周报」标记完成')).toBe('周报')
    expect(extractCommandTarget('删掉周报')).toBe('周报')
  })
  it('splits only on newlines/semicolons/numbered lists', () => {
    expect(splitSegments('研究 Cubox、OmniFocus')).toEqual(['研究 Cubox、OmniFocus'])
    // 各段需 ≥4 字（承接现网 filter length>=4）
    expect(splitSegments('买点牛奶回来\n写季度周报\n提交差旅报销')).toEqual([
      '买点牛奶回来',
      '写季度周报',
      '提交差旅报销',
    ])
  })
})
