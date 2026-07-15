// @linx/kernel-clock — Clock 端口 + UTC 时间源（修 P7）。
// 现网 nowIso()/nowIsoMs() 落 TEXT 本地朴素 ISO（无时区）→ 统一为 UTC ISO（带 Z），
// DB 侧配合 timestamptz。时钟以端口注入，测试用 fixedClock 确定化，杜绝对 Date.now 的隐式依赖。

export interface Clock {
  /** 当前 UTC 毫秒时间戳 */
  nowMs(): number
  /** 当前 UTC 时刻的 ISO-8601（带 Z 后缀） */
  nowIso(): string
}

export const systemClock: Clock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
}

/** 固定时钟：测试确定化 */
export function fixedClock(fixedMs: number): Clock {
  const iso = new Date(fixedMs).toISOString()
  return {
    nowMs: () => fixedMs,
    nowIso: () => iso,
  }
}

/** 可推进的手动时钟：测试中模拟时间流逝 */
export function manualClock(startMs = 0): Clock & { advance(ms: number): void } {
  let current = startMs
  return {
    nowMs: () => current,
    nowIso: () => new Date(current).toISOString(),
    advance: (ms: number) => {
      current += ms
    },
  }
}
