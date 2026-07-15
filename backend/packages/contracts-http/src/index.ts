// @linx/contracts-http — 前后端 HTTP 契约（Zod）。手写、与前端 TS 1:1、冻结现契约。
// P0 仅健康检查 + 统一错误信封；各 BC 迁移时按 §backend-api-contract 逐步填充
// （tasks / auth / friends / collaboration / chat / notifications / settings / admin / search / plan）。
import { z } from 'zod'

/** GET /api/health 响应契约 */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
  uptimeMs: z.number().nonnegative(),
  time: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

/** 统一错误信封契约（与 @linx/kernel-errors.toEnvelope 对齐；前端零改动） */
export const ErrorEnvelopeSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
})
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>
