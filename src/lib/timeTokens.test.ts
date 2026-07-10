import { test, expect } from 'vitest'
import { expandTimeTokens } from './timeTokens'

// 基准时刻：2026-07-06 10:24 Asia/Shanghai（= 02:24Z，上海 UTC+8）
const NOW = new Date('2026-07-06T02:24:00Z')
const SH = 'Asia/Shanghai'
const ex = (s: string): string => expandTimeTokens(s, { now: NOW, timeZone: SH })

test('acceptance samples (Asia/Shanghai, 2026-07-06 10:24)', () => {
  expect(ex('@now')).toBe('2026-07-06 10:24')
  expect(ex('@现在')).toBe('2026-07-06 10:24')
  expect(ex('@time')).toBe('10:24')
  expect(ex('@today')).toBe('2026-07-06')
  expect(ex('@今天')).toBe('2026-07-06')
  expect(ex('@date')).toBe('2026-07-06')
  expect(ex('@tomorrow')).toBe('2026-07-07')
  expect(ex('@明天')).toBe('2026-07-07')
  expect(ex('@yesterday')).toBe('2026-07-05')
  expect(ex('@昨天')).toBe('2026-07-05')
  expect(ex('@后天')).toBe('2026-07-08')
  expect(ex('@前天')).toBe('2026-07-04')
})

test('English aliases are case-insensitive', () => {
  expect(ex('@TODAY')).toBe('2026-07-06')
  expect(ex('@Tomorrow')).toBe('2026-07-07')
  expect(ex('@NOW')).toBe('2026-07-06 10:24')
})

test('unrecognized @tokens are kept verbatim (mentions / tags / commands unbroken)', () => {
  expect(ex('@张三 你好')).toBe('@张三 你好')      // 人名提及不动
  expect(ex('@foobar')).toBe('@foobar')            // 未知英文词
  expect(ex('@todayish 待办')).toBe('@todayish 待办') // 整段不等于别名 -> 不展开
  expect(ex('#标签 @天气')).toBe('#标签 @天气')      // 标签与非别名中文
  expect(ex('把 @项目A 标记完成')).toBe('把 @项目A 标记完成') // 命令里的引用
})

test('expands inside a sentence and with adjacent CJK', () => {
  expect(ex('交报告 @today 之前')).toBe('交报告 2026-07-06 之前')
  expect(ex('@明天开会')).toBe('2026-07-07开会')       // 中文前缀匹配 + 保留尾巴
  expect(ex('@today交周报')).toBe('2026-07-06交周报')
  expect(ex('先 @now 再 @tomorrow')).toBe('先 2026-07-06 10:24 再 2026-07-07')
})

test('day boundary is computed in the target timezone', () => {
  // 23:30 上海（= 15:30Z）：明天应是 07-07，@now 反映当地 23:30
  const late = new Date('2026-07-06T15:30:00Z')
  expect(expandTimeTokens('@tomorrow', { now: late, timeZone: SH })).toBe('2026-07-07')
  expect(expandTimeTokens('@now', { now: late, timeZone: SH })).toBe('2026-07-06 23:30')
  // 00:10 上海（= 前一天 16:10Z）：昨天应回退到 07-05
  const early = new Date('2026-07-06T16:10:00Z') // 上海 2026-07-07 00:10
  expect(expandTimeTokens('@today', { now: early, timeZone: SH })).toBe('2026-07-07')
  expect(expandTimeTokens('@yesterday', { now: early, timeZone: SH })).toBe('2026-07-06')
})

test('same instant renders per the given timezone', () => {
  // 同一时刻在洛杉矶(7月 UTC-7) = 2026-07-05 19:24
  expect(expandTimeTokens('@now', { now: NOW, timeZone: 'America/Los_Angeles' })).toBe('2026-07-05 19:24')
  expect(expandTimeTokens('@today', { now: NOW, timeZone: 'America/Los_Angeles' })).toBe('2026-07-05')
  expect(expandTimeTokens('@time', { now: NOW, timeZone: 'America/Los_Angeles' })).toBe('19:24')
})

test('month / year boundary arithmetic', () => {
  const eom = new Date('2026-07-31T02:00:00Z') // 上海 07-31 10:00
  expect(expandTimeTokens('@tomorrow', { now: eom, timeZone: SH })).toBe('2026-08-01')
  const eoy = new Date('2026-12-31T02:00:00Z')
  expect(expandTimeTokens('@tomorrow', { now: eoy, timeZone: SH })).toBe('2027-01-01')
})

test('no @ -> returns input unchanged (fast path)', () => {
  expect(ex('明天开会')).toBe('明天开会')
  expect(ex('')).toBe('')
})
