// @linx/kernel-errors — 类型化 AppError 基类 + 错误码。
// 承接现网单一 `{ error }` 处理器 → 稳定错误码 + httpStatus 映射。
// 错误信封保持「扁平 error:string + code」以兼容现有前端（见 ADR 收口 B3）。

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'

const CODE_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

export interface ErrorEnvelope {
  error: string
  code: ErrorCode
  details?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly httpStatus: number
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = CODE_STATUS[code]
    if (details !== undefined) this.details = details
  }

  toEnvelope(): ErrorEnvelope {
    const base: ErrorEnvelope = { error: this.message, code: this.code }
    if (this.details !== undefined) base.details = this.details
    return base
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError

// 便捷构造器
export const validationError = (message: string, details?: unknown): AppError =>
  new AppError('VALIDATION', message, details)
export const notFoundError = (message = 'Not found'): AppError => new AppError('NOT_FOUND', message)
export const forbiddenError = (message = 'Forbidden'): AppError => new AppError('FORBIDDEN', message)
export const unauthenticatedError = (message = 'Unauthenticated'): AppError =>
  new AppError('UNAUTHENTICATED', message)
export const conflictError = (message: string): AppError => new AppError('CONFLICT', message)
