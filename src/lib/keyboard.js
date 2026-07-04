// 键盘/输入法（IME）辅助：纯函数，方便回归测试。
//
// 中文/日文/韩文等输入法在「组合输入」阶段（拼音还没上屏、正在选字）也会触发
// keydown。这时的 Enter 是给输入法用来「确认候选词」的，绝不能当成「发送消息」，
// 否则就会把拼音字母原样发出去（本次修复的 Bug）。

// 这次 keydown 是否处于 IME 组合输入中。
// - e.isComposing：W3C 标准信号，现代输入法都会给。
// - e.keyCode === 229：历史信号，部分老输入法在组合阶段只给这个。
// - composingFlag：compositionstart/compositionend 维护的兜底标志，
//   兼容个别 isComposing 不可靠的输入法。
export function isComposingEvent(e, composingFlag) {
  if (composingFlag) return true
  if (!e) return false
  return !!e.isComposing || e.keyCode === 229 || e.which === 229
}

// 是否应触发「发送」：必须是不带 Shift 的 Enter，且不处于组合输入中。
export function shouldSendOnEnter(e, composingFlag) {
  if (!e || e.key !== 'Enter' || e.shiftKey) return false
  return !isComposingEvent(e, composingFlag)
}
