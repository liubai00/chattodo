import { test, expect } from 'vitest'
import { shouldSendOnEnter, isComposingEvent } from './keyboard'

// 回归：中文 IME 组合输入期间的 Enter 不能发送（Bug 复现场景）
test('Enter during IME composition (isComposing) does NOT send', () => {
  expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: true }, false)).toBe(false)
})

test('Enter during IME composition (legacy keyCode 229) does NOT send', () => {
  expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false, keyCode: 229 }, false)).toBe(false)
})

test('Enter while composing flag set (compositionstart not yet ended) does NOT send', () => {
  expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false }, true)).toBe(false)
})

// 组合结束后（compositionend 已把文本上屏，flag 归位），再按 Enter 才发送
test('plain Enter after composition ended sends', () => {
  expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false }, false)).toBe(true)
})

test('Shift+Enter never sends (newline)', () => {
  expect(shouldSendOnEnter({ key: 'Enter', shiftKey: true, isComposing: false }, false)).toBe(false)
})

test('non-Enter keys never send', () => {
  expect(shouldSendOnEnter({ key: 'a', shiftKey: false }, false)).toBe(false)
})

test('isComposingEvent reflects each signal independently', () => {
  expect(isComposingEvent({ isComposing: true }, false)).toBe(true)
  expect(isComposingEvent({ keyCode: 229 }, false)).toBe(true)
  expect(isComposingEvent({}, true)).toBe(true)
  expect(isComposingEvent({ key: 'Enter' }, false)).toBe(false)
})
