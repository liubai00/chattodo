// @linx/contracts-events — 领域/集成/实时事件契约（domain 与 infra 共用）。
// P0 仅基类型骨架；各 BC 迁移时补具体事件（如 social.friendship.removed、task.moved-out、
// LiveEvent 实时信封）。事件名规范：<context>.<aggregate>.<pastVerb>（点分小写）。

/** 事件名类型约束：三段点分（context.aggregate.pastVerb） */
export type EventName = `${string}.${string}.${string}`

/** 领域事件基信封 */
export interface DomainEvent<TName extends EventName = EventName, TPayload = unknown> {
  readonly name: TName
  readonly occurredAtMs: number
  readonly payload: TPayload
}

/** 构造领域事件（占位工具，随 kernel-clock 注入时间） */
export function makeEvent<TName extends EventName, TPayload>(
  name: TName,
  occurredAtMs: number,
  payload: TPayload,
): DomainEvent<TName, TPayload> {
  return { name, occurredAtMs, payload }
}
