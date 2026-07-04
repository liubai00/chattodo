import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSendOnEnter, isComposingEvent } from './keyboard.js'

// 回归：中文 IME 组合输入期间的 Enter 不能发送（Bug 复现场景）
test('Enter during IME composition (isComposing) does NOT send', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: true }, false), false)
})

test('Enter during IME composition (legacy keyCode 229) does NOT send', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, keyCode: 229 }, false), false)
})

test('Enter while composing flag set (compositionstart not yet ended) does NOT send', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false }, true), false)
})

// 组合结束后（compositionend 已把文本上屏，flag 归位），再按 Enter 才发送
test('plain Enter after composition ended sends', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false }, false), true)
})

test('Shift+Enter never sends (newline)', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: true, isComposing: false }, false), false)
})

test('non-Enter keys never send', () => {
  assert.equal(shouldSendOnEnter({ key: 'a', shiftKey: false }, false), false)
})

test('isComposingEvent reflects each signal independently', () => {
  assert.equal(isComposingEvent({ isComposing: true }, false), true)
  assert.equal(isComposingEvent({ keyCode: 229 }, false), true)
  assert.equal(isComposingEvent({}, true), true)
  assert.equal(isComposingEvent({ key: 'Enter' }, false), false)
})
