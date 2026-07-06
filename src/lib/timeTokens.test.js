import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandTimeTokens } from './timeTokens.js'

// 基准时刻：2026-07-06 10:24 Asia/Shanghai（= 02:24Z，上海 UTC+8）
const NOW = new Date('2026-07-06T02:24:00Z')
const SH = 'Asia/Shanghai'
const ex = (s) => expandTimeTokens(s, { now: NOW, timeZone: SH })

test('acceptance samples (Asia/Shanghai, 2026-07-06 10:24)', () => {
  assert.equal(ex('@now'), '2026-07-06 10:24')
  assert.equal(ex('@现在'), '2026-07-06 10:24')
  assert.equal(ex('@time'), '10:24')
  assert.equal(ex('@today'), '2026-07-06')
  assert.equal(ex('@今天'), '2026-07-06')
  assert.equal(ex('@date'), '2026-07-06')
  assert.equal(ex('@tomorrow'), '2026-07-07')
  assert.equal(ex('@明天'), '2026-07-07')
  assert.equal(ex('@yesterday'), '2026-07-05')
  assert.equal(ex('@昨天'), '2026-07-05')
  assert.equal(ex('@后天'), '2026-07-08')
  assert.equal(ex('@前天'), '2026-07-04')
})

test('English aliases are case-insensitive', () => {
  assert.equal(ex('@TODAY'), '2026-07-06')
  assert.equal(ex('@Tomorrow'), '2026-07-07')
  assert.equal(ex('@NOW'), '2026-07-06 10:24')
})

test('unrecognized @tokens are kept verbatim (mentions / tags / commands unbroken)', () => {
  assert.equal(ex('@张三 你好'), '@张三 你好')      // 人名提及不动
  assert.equal(ex('@foobar'), '@foobar')            // 未知英文词
  assert.equal(ex('@todayish 待办'), '@todayish 待办') // 整段不等于别名 → 不展开
  assert.equal(ex('#标签 @天气'), '#标签 @天气')      // 标签与非别名中文
  assert.equal(ex('把 @项目A 标记完成'), '把 @项目A 标记完成') // 命令里的引用
})

test('expands inside a sentence and with adjacent CJK', () => {
  assert.equal(ex('交报告 @today 之前'), '交报告 2026-07-06 之前')
  assert.equal(ex('@明天开会'), '2026-07-07开会')       // 中文前缀匹配 + 保留尾巴
  assert.equal(ex('@today交周报'), '2026-07-06交周报')
  assert.equal(ex('先 @now 再 @tomorrow'), '先 2026-07-06 10:24 再 2026-07-07')
})

test('day boundary is computed in the target timezone', () => {
  // 23:30 上海（= 15:30Z）：明天应是 07-07，@now 反映当地 23:30
  const late = new Date('2026-07-06T15:30:00Z')
  assert.equal(expandTimeTokens('@tomorrow', { now: late, timeZone: SH }), '2026-07-07')
  assert.equal(expandTimeTokens('@now', { now: late, timeZone: SH }), '2026-07-06 23:30')
  // 00:10 上海（= 前一天 16:10Z）：昨天应回退到 07-05
  const early = new Date('2026-07-06T16:10:00Z') // 上海 2026-07-07 00:10
  assert.equal(expandTimeTokens('@today', { now: early, timeZone: SH }), '2026-07-07')
  assert.equal(expandTimeTokens('@yesterday', { now: early, timeZone: SH }), '2026-07-06')
})

test('same instant renders per the given timezone', () => {
  // 同一时刻在洛杉矶(7月 UTC-7) = 2026-07-05 19:24
  assert.equal(expandTimeTokens('@now', { now: NOW, timeZone: 'America/Los_Angeles' }), '2026-07-05 19:24')
  assert.equal(expandTimeTokens('@today', { now: NOW, timeZone: 'America/Los_Angeles' }), '2026-07-05')
  assert.equal(expandTimeTokens('@time', { now: NOW, timeZone: 'America/Los_Angeles' }), '19:24')
})

test('month / year boundary arithmetic', () => {
  const eom = new Date('2026-07-31T02:00:00Z') // 上海 07-31 10:00
  assert.equal(expandTimeTokens('@tomorrow', { now: eom, timeZone: SH }), '2026-08-01')
  const eoy = new Date('2026-12-31T02:00:00Z')
  assert.equal(expandTimeTokens('@tomorrow', { now: eoy, timeZone: SH }), '2027-01-01')
})

test('no @ → returns input unchanged (fast path)', () => {
  assert.equal(ex('明天开会'), '明天开会')
  assert.equal(ex(''), '')
})
