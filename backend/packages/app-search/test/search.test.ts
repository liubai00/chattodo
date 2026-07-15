import { describe, it, expect } from 'vitest'
import { makeSearchApp, type SearchAppDeps } from '../src/index.js'

function deps(privacyMode = false): SearchAppDeps {
  return {
    settings: { async get() { return { privacyMode, workspaceMode: 'work' } } },
    tasks: {
      async all() {
        return [
          { id: 't1', title: '写方案', tags: ['急'], privacyScope: 'work' },
          { id: 't2', title: '买菜', tags: [], privacyScope: 'personal' },
          { id: 't3', title: '看论文', tags: ['research'], privacyScope: 'work' },
        ]
      },
    },
    ideas: {
      async all() {
        return [{ id: 'i1', title: '研究 Cubox', rawText: '稍后读方案', privacyScope: 'work' }]
      },
    },
    projects: {
      async all() {
        return [{ id: 'p1', name: '方案项目', privacyScope: 'work' }]
      },
    },
  }
}

describe('search', () => {
  it('empty query → empty results', async () => {
    expect(await makeSearchApp(deps()).search('')).toEqual({ results: [] })
    expect(await makeSearchApp(deps()).search('   ')).toEqual({ results: [] })
  })

  it('matches title/tags/rawText/name across tasks+ideas+projects (task,idea,project order)', async () => {
    const { results } = await makeSearchApp(deps()).search('方案')
    expect(results).toEqual([
      { type: 'task', id: 't1', label: '写方案' },
      { type: 'todo_idea', id: 'i1', label: '研究 Cubox' }, // rawText '稍后读方案'
      { type: 'project', id: 'p1', label: '方案项目' },
    ])
  })

  it('tag match', async () => {
    const { results } = await makeSearchApp(deps()).search('research')
    expect(results).toEqual([{ type: 'task', id: 't3', label: '看论文' }])
  })

  it('privacy mode filters personal-scope items out (work mode)', async () => {
    const { results } = await makeSearchApp(deps(true)).search('菜')
    expect(results).toEqual([]) // 买菜 is personal → hidden
  })
})

describe('mentions', () => {
  it('empty query → recent projects then tasks (each capped 8)', async () => {
    const { results } = await makeSearchApp(deps()).mentions('')
    expect(results[0]).toMatchObject({ type: 'project', id: 'p1' })
    expect(results.filter((r) => r.type === 'task')).toHaveLength(3)
  })

  it('query filters both', async () => {
    const { results } = await makeSearchApp(deps()).mentions('方案')
    expect(results).toEqual([
      { type: 'project', id: 'p1', label: '方案项目' },
      { type: 'task', id: 't1', label: '写方案' },
    ])
  })
})
