// RouteRegistry — 逐路由组的新旧权威开关（Strangler G3）。
// 一个 BC 的 interface 插件只有在其组被标记 'new' 时才注册（权威）；否则该组路由 fall-through 到 legacy。
// 配置化 + 可由环境变量热改（默认 'legacy'，保守回退到现网行为）。

export type RouteTarget = 'new' | 'legacy'

/** 组名归一：小写（配合 applyEnv 的 _→- 映射，杜绝大小写导致的 env 覆盖静默失配）。 */
function norm(group: string): string {
  return group.toLowerCase()
}

export interface RouteRegistryOptions {
  /** 未显式配置的组走此目标，默认 'legacy'。 */
  default?: RouteTarget
  /** 组 → 目标 的初始映射。 */
  groups?: Record<string, RouteTarget>
}

export class RouteRegistry {
  private readonly groups = new Map<string, RouteTarget>()
  private readonly fallback: RouteTarget

  constructor(opts: RouteRegistryOptions = {}) {
    this.fallback = opts.default ?? 'legacy'
    for (const [group, target] of Object.entries(opts.groups ?? {})) {
      this.groups.set(norm(group), target)
    }
  }

  set(group: string, target: RouteTarget): void {
    this.groups.set(norm(group), target)
  }

  target(group: string): RouteTarget {
    return this.groups.get(norm(group)) ?? this.fallback
  }

  isNew(group: string): boolean {
    return this.target(group) === 'new'
  }

  /** 从环境变量覆盖：LINX_ROUTE_<GROUP>=new|legacy（GROUP 大写，'-' → '_'）。 */
  applyEnv(env: NodeJS.ProcessEnv): void {
    for (const [key, value] of Object.entries(env)) {
      const m = /^LINX_ROUTE_(.+)$/.exec(key)
      if (!m || (value !== 'new' && value !== 'legacy')) continue
      const group = m[1]!.toLowerCase().replace(/_/g, '-')
      this.groups.set(group, value)
    }
  }
}
