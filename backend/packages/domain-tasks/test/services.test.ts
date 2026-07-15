import { describe, it, expect } from 'vitest'
import {
  filterTasks,
  visibleFilter,
  isToday,
  isOverdue,
  collaboratorPatch,
  buildNonTodoFromTask,
  buildTaskFromIdea,
  buildTaskFromNon,
  type Task,
  type TodoIdea,
  type NonTodo,
  type CaptureRecord,
} from '../src/index.js'

const NOW = new Date('2026-07-15T12:00:00').getTime()

function task(p: Partial<Task>): Task {
  return {
    id: 't',
    title: '',
    notes: '',
    status: 'todo',
    projectId: null,
    tags: [],
    context: '',
    dueAt: null,
    plannedAt: null,
    durationMinutes: null,
    priority: 3,
    privacyScope: 'work',
    sourceIdeaId: null,
    assignee: null,
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}

describe('isToday / isOverdue', () => {
  it('isToday matches local calendar day, false for empty', () => {
    expect(isToday('2026-07-15T23:59:00', NOW)).toBe(true)
    expect(isToday('2026-07-16T00:00:00', NOW)).toBe(false)
    expect(isToday(null, NOW)).toBe(false)
    expect(isToday('', NOW)).toBe(false)
  })
  it('isOverdue compares against now', () => {
    expect(isOverdue('2026-07-15T11:59:00', NOW)).toBe(true)
    expect(isOverdue('2026-07-15T12:01:00', NOW)).toBe(false)
    expect(isOverdue(null, NOW)).toBe(false)
  })
})

describe('filterTasks', () => {
  const tasks = [
    task({ id: 'a', status: 'todo', privacyScope: 'work', title: '写周报', tags: ['report'] }),
    task({ id: 'b', status: 'in_progress', privacyScope: 'personal', notes: '买菜' }),
    task({ id: 'c', status: 'done', privacyScope: 'work' }),
    task({ id: 'd', status: 'archived', privacyScope: 'mixed', dueAt: '2026-07-15T09:00:00' }),
  ]

  it('view=open keeps todo + in_progress', () => {
    expect(filterTasks(tasks, { view: 'open' }, NOW).map((t) => t.id)).toEqual(['a', 'b'])
  })
  it('view=done keeps done only', () => {
    expect(filterTasks(tasks, { view: 'done' }, NOW).map((t) => t.id)).toEqual(['c'])
  })
  it('view=today keeps tasks due/planned today', () => {
    expect(filterTasks(tasks, { view: 'today' }, NOW).map((t) => t.id)).toEqual(['d'])
  })
  it('view=all keeps everything, preserving order', () => {
    expect(filterTasks(tasks, { view: 'all' }, NOW).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('scope filters by privacyScope (all = no filter)', () => {
    expect(filterTasks(tasks, { scope: 'work' }, NOW).map((t) => t.id)).toEqual(['a', 'c'])
    expect(filterTasks(tasks, { scope: 'all' }, NOW).length).toBe(4)
  })
  it('search matches title/notes/tags (case-insensitive)', () => {
    expect(filterTasks(tasks, { search: 'REPORT' }, NOW).map((t) => t.id)).toEqual(['a'])
    expect(filterTasks(tasks, { search: '买菜' }, NOW).map((t) => t.id)).toEqual(['b'])
  })
  it('applies scope → view → search together', () => {
    const out = filterTasks(tasks, { scope: 'work', view: 'open', search: '周报' }, NOW)
    expect(out.map((t) => t.id)).toEqual(['a'])
  })
})

describe('visibleFilter', () => {
  const items = [
    { id: 1, privacyScope: 'work' as const },
    { id: 2, privacyScope: 'personal' as const },
    { id: 3, privacyScope: 'mixed' as const },
  ]
  it('privacyMode off → all', () => {
    expect(visibleFilter(items, { privacyMode: false, workspaceMode: 'work' })).toHaveLength(3)
  })
  it('privacyMode on → workspaceMode + mixed', () => {
    expect(
      visibleFilter(items, { privacyMode: true, workspaceMode: 'work' }).map((i) => i.id),
    ).toEqual([1, 3])
    expect(
      visibleFilter(items, { privacyMode: true, workspaceMode: 'personal' }).map((i) => i.id),
    ).toEqual([2, 3])
  })
})

describe('collaboratorPatch', () => {
  it('keeps only status', () => {
    expect(collaboratorPatch({ status: 'done', title: 'x', priority: 1 })).toEqual({ status: 'done' })
    expect(collaboratorPatch({ title: 'x' })).toEqual({})
  })
})

describe('lifecycle mappers', () => {
  it('buildNonTodoFromTask uses capture record when present', () => {
    const t = task({ title: 'T', notes: 'N', privacyScope: 'personal' })
    const rec: CaptureRecord = {
      id: 'r',
      rawInput: 'RAW',
      source: 'chat',
      aiKind: 'task',
      confidence: null,
      aiReason: 'REASON',
      resultEntityType: 'task',
      resultEntityId: 't',
      status: 'ok',
      createdAt: '',
    }
    expect(buildNonTodoFromTask(t, rec)).toEqual({
      title: 'T',
      summary: 'N',
      rawText: 'RAW',
      reason: 'REASON',
      suggestedDestination: 'archive',
      privacyScope: 'personal',
      source: 'correction',
      corrected: true,
    })
  })
  it('buildNonTodoFromTask falls back without a record', () => {
    const t = task({ title: 'T', notes: '' })
    const out = buildNonTodoFromTask(t)
    expect(out.summary).toBe('T') // notes || title
    expect(out.rawText).toBe('T')
    expect(out.reason).toContain('误分类纠错')
    expect(out.corrected).toBe(true)
  })
  it('buildTaskFromIdea sets duration 30 + sourceIdeaId', () => {
    const idea: TodoIdea = {
      id: 'i1',
      title: 'Idea',
      rawText: 'raw',
      status: 'clarifying',
      suggestedNextAction: '',
      aiReason: '',
      privacyScope: 'work',
      source: 'chat',
      createdAt: '',
      updatedAt: '',
    }
    expect(buildTaskFromIdea(idea)).toMatchObject({
      title: 'Idea',
      notes: 'raw',
      durationMinutes: 30,
      sourceIdeaId: 'i1',
      status: 'todo',
    })
  })
  it('buildTaskFromNon sets duration 30 + sourceIdeaId null', () => {
    const non: NonTodo = {
      id: 'n1',
      title: 'Non',
      summary: '',
      rawText: 'body',
      reason: '',
      suggestedDestination: 'archive',
      privacyScope: 'mixed',
      source: 'chat',
      corrected: false,
      createdAt: '',
      updatedAt: '',
    }
    expect(buildTaskFromNon(non)).toMatchObject({
      title: 'Non',
      notes: 'body',
      durationMinutes: 30,
      sourceIdeaId: null,
      privacyScope: 'mixed',
    })
  })
})
