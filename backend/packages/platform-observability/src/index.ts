// @linx/platform-observability — prom-client 指标 + 就绪探针注册表（修 P13：无 metrics / health-ready 未分离）。
// /health = 存活（进程在）；/ready = 就绪（依赖 PG/Redis 可用）。各 platform 在 bootstrap 注册就绪检查。
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client'

export const metricsRegistry = new Registry()
collectDefaultMetrics({ register: metricsRegistry })

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'HTTP 请求总数',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
})

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP 请求耗时（毫秒）',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [metricsRegistry],
})

export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics()
}

export const metricsContentType = metricsRegistry.contentType

// ── 就绪探针注册表 ──
export type ReadinessCheck = () => Promise<boolean> | boolean

export interface ReadinessResult {
  ok: boolean
  checks: Record<string, boolean>
}

export class ReadinessRegistry {
  private readonly checks = new Map<string, ReadinessCheck>()

  register(name: string, check: ReadinessCheck): void {
    this.checks.set(name, check)
  }

  unregister(name: string): void {
    this.checks.delete(name)
  }

  async check(): Promise<ReadinessResult> {
    const entries = [...this.checks.entries()]
    const settled = await Promise.all(
      entries.map(async ([name, check]): Promise<readonly [string, boolean]> => {
        try {
          return [name, await check()] as const
        } catch {
          return [name, false] as const
        }
      }),
    )
    const checks: Record<string, boolean> = {}
    let ok = true
    for (const [name, value] of settled) {
      checks[name] = value
      if (!value) ok = false
    }
    return { ok, checks }
  }
}

/** 进程级默认就绪注册表（apps/api 与各 platform 共用） */
export const readiness = new ReadinessRegistry()
