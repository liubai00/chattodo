import { describe, it, expect } from 'vitest'
import { planNextBlock, makePlanApp, type PlanTask } from '../src/index.js'

const T = (o: Partial<PlanTask> & { id: string }): PlanTask => ({
  title: o.id,
  status: 'todo',
  priority: 3,
  ...o,
})

describe('planNextBlock (pure)', () => {
  it('sorts by due↑ then priority↑ then duration↑; caps at 4 items / block', () => {
    const tasks = [
      T({ id: 'a', dueAt: '2026-07-20T10:00:00', priority: 3, durationMinutes: 30 }),
      T({ id: 'b', dueAt: '2026-07-18T10:00:00', priority: 2, durationMinutes: 60 }),
      T({ id: 'c', priority: 1, durationMinutes: 30 }), // no due → Infinity
      T({ id: 'd', dueAt: '2026-07-18T10:00:00', priority: 1, durationMinutes: 30 }),
    ]
    const { plan, totalMinutes } = planNextBlock(tasks, 120)
    // 排序：d(7/18,p1) → b(7/18,p2) → a(7/20,p3) → c(Inf)。
    // 贪心：d(30)+b(60)+a(30)=120 → used>=120 触发 break，c 不入选。
    expect(plan.map((p) => p.task.id)).toEqual(['d', 'b', 'a'])
    expect(totalMinutes).toBe(120)
  })

  it('excludes done/archived; skips items that would overflow block+15', () => {
    const tasks = [
      T({ id: 'done', status: 'done', durationMinutes: 30 }),
      T({ id: 'big', durationMinutes: 200 }), // 200 > 120+15 → skipped
      T({ id: 'ok', durationMinutes: 30 }),
    ]
    const { plan } = planNextBlock(tasks, 120)
    expect(plan.map((p) => p.task.id)).toEqual(['ok'])
  })

  it('default duration 30 when missing', () => {
    const { totalMinutes } = planNextBlock([T({ id: 'x' })], 120)
    expect(totalMinutes).toBe(30)
  })
})

describe('makePlanApp', () => {
  function fakeDeps(tasks: PlanTask[], privacyMode = false) {
    const store = new Map(tasks.map((t) => [t.id, { ...t }]))
    const logged: string[] = []
    const updates: Array<{ id: string; plannedAt?: string }> = []
    return {
      logged,
      updates,
      deps: {
        settings: { async get() { return { privacyMode, workspaceMode: 'work' } } },
        tasks: {
          async all() { return [...store.values()] },
          async get(id: string) { return store.get(id) },
          async update(id: string, patch: { plannedAt?: string }) {
            const t = store.get(id)
            if (!t) return undefined
            Object.assign(t, patch)
            updates.push({ id, ...patch })
            return t
          },
        },
        activity: { async log(_t: string, text: string) { logged.push(text) } },
        now: () => new Date('2026-07-15T09:00:00Z').getTime(),
      },
    }
  }

  it('plan() privacy-filters then plans', async () => {
    const { deps } = fakeDeps(
      [T({ id: 'work1', privacyScope: 'work' }), T({ id: 'pers1', privacyScope: 'personal' })],
      true,
    )
    const res = await makePlanApp(deps).plan(120)
    expect(res.plan.map((p) => p.task.id)).toEqual(['work1']) // personal filtered out
  })

  it('commit() sets sequential plannedAt (UTC ISO) + logs activity; skips done/unknown; caps 12', async () => {
    const { deps, logged, updates } = fakeDeps([
      T({ id: 't1' }),
      T({ id: 't2' }),
      T({ id: 'tdone', status: 'done' }),
    ])
    const app = makePlanApp(deps)
    const { updated } = await app.commit([
      { id: 't1', minutes: 30 },
      { id: 'tdone', minutes: 30 }, // skipped
      { id: 'nope', minutes: 30 }, // skipped
      { id: 't2', minutes: 45 },
    ])
    expect(updated.map((u) => u?.id)).toEqual(['t1', 't2'])
    expect(updates[0]).toMatchObject({ id: 't1', plannedAt: '2026-07-15T09:00:00.000Z' })
    // t2 starts 30min after t1
    expect(updates[1]).toMatchObject({ id: 't2', plannedAt: '2026-07-15T09:30:00.000Z' })
    expect(logged).toEqual(['加入执行计划', '加入执行计划'])
  })

  it('commit() clamps minutes to [5,240]', async () => {
    const { deps, updates } = fakeDeps([T({ id: 't1' }), T({ id: 't2' })])
    await makePlanApp(deps).commit([
      { id: 't1', minutes: 1 }, // → 5
      { id: 't2', minutes: 30 },
    ])
    // t2 planned 5 min after t1 (clamped)
    expect(updates[1]?.plannedAt).toBe('2026-07-15T09:05:00.000Z')
  })
})
