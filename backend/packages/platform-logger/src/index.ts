// @linx/platform-logger — pino + AsyncLocalStorage reqId 贯穿（修 P13：无 request-id / 无结构化日志）。
// 请求进入时 enterReqId(reqId)，此后同一异步链上的所有日志自动带 reqId（经 mixin 注入）。
import { AsyncLocalStorage } from 'node:async_hooks'
import pino, { type Logger } from 'pino'

interface RequestContext {
  reqId: string
}

const als = new AsyncLocalStorage<RequestContext>()

export const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  mixin() {
    const ctx = als.getStore()
    return ctx ? { reqId: ctx.reqId } : {}
  },
})

/** 在带 reqId 的上下文中执行（同步/异步均可，返回 fn 结果） */
export function runWithReqId<T>(reqId: string, fn: () => T): T {
  return als.run({ reqId }, fn)
}

/** 将当前异步上下文绑定 reqId（Fastify onRequest 钩子用；对后续同链异步生效） */
export function enterReqId(reqId: string): void {
  als.enterWith({ reqId })
}

/** 读取当前上下文 reqId（无则 undefined） */
export function getReqId(): string | undefined {
  return als.getStore()?.reqId
}

/** 获取基础 logger（自动带当前 reqId） */
export function getLogger(): Logger {
  return baseLogger
}

export type { Logger }
