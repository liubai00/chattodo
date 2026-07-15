import type { FastifyInstance } from 'fastify'
import { HealthResponseSchema, type HealthResponse } from '@linx/contracts-http'
import { systemClock } from '@linx/kernel-clock'

const startedAtMs = systemClock.nowMs()

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // 存活探针（/ready 就绪探针在 P1 platform-observability 引入 PG+Redis 检查后加入）
  app.get('/health', async (): Promise<HealthResponse> => {
    const body: HealthResponse = {
      ok: true,
      service: 'linx-api',
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeMs: systemClock.nowMs() - startedAtMs,
      time: systemClock.nowIso(),
    }
    // P0 演示 contracts-http 生效；P1 起改用 fastify-type-provider-zod 在序列化层校验。
    return HealthResponseSchema.parse(body)
  })
}
