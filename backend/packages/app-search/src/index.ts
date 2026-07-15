// @linx/app-search — 命令面板搜索 + @引用（verbatim 承接 services/search.js）。
import { visibleFilter } from '@linx/domain-settings'

export interface SearchTask {
  id: string
  title: string
  tags?: string[]
  privacyScope?: string
}
export interface SearchIdea {
  id: string
  title: string
  rawText?: string
  privacyScope?: string
}
export interface SearchProject {
  id: string
  name: string
  privacyScope?: string
}

export interface SearchResult {
  type: 'task' | 'todo_idea' | 'project'
  id: string
  label: string
}

export interface SearchAppDeps {
  settings: { get(): Promise<{ privacyMode: boolean; workspaceMode: string } | undefined> }
  tasks: { all(): Promise<SearchTask[]> }
  ideas: { all(): Promise<SearchIdea[]> }
  projects: { all(): Promise<SearchProject[]> }
}

const has = (text: string | undefined | null, q: string): boolean =>
  (text || '').toLowerCase().includes(q)

const DEFAULT_SETTINGS = { privacyMode: false, workspaceMode: 'work' }

export function makeSearchApp(deps: SearchAppDeps) {
  const { settings, tasks, ideas, projects } = deps

  return {
    // 命令面板：tasks + ideas + projects（隐私过滤）。空 query → 空结果。
    async search(q: string | undefined): Promise<{ results: SearchResult[] }> {
      const query = (q || '').trim().toLowerCase()
      if (!query) return { results: [] }
      const [s, taskRows, ideaRows, projRows] = await Promise.all([
        settings.get(),
        tasks.all(),
        ideas.all(),
        projects.all(),
      ])
      const settingsVal = s ?? DEFAULT_SETTINGS
      const t = visibleFilter(taskRows, settingsVal)
        .filter((x) => has(x.title, query) || (x.tags || []).some((tag) => has(tag, query)))
        .map((x): SearchResult => ({ type: 'task', id: x.id, label: x.title }))
      const i = visibleFilter(ideaRows, settingsVal)
        .filter((x) => has(x.title, query) || has(x.rawText, query))
        .map((x): SearchResult => ({ type: 'todo_idea', id: x.id, label: x.title }))
      const p = visibleFilter(projRows, settingsVal)
        .filter((x) => has(x.name, query))
        .map((x): SearchResult => ({ type: 'project', id: x.id, label: x.name }))
      return { results: [...t, ...i, ...p] }
    },

    // @引用：projects + tasks（空 query 返回最近条目，各截前 8）。
    async mentions(q: string | undefined): Promise<{ results: SearchResult[] }> {
      const query = (q || '').trim().toLowerCase()
      const [s, projRows, taskRows] = await Promise.all([settings.get(), projects.all(), tasks.all()])
      const settingsVal = s ?? DEFAULT_SETTINGS
      const p = visibleFilter(projRows, settingsVal)
        .filter((x) => !query || has(x.name, query))
        .slice(0, 8)
        .map((x): SearchResult => ({ type: 'project', id: x.id, label: x.name }))
      const t = visibleFilter(taskRows, settingsVal)
        .filter((x) => !query || has(x.title, query))
        .slice(0, 8)
        .map((x): SearchResult => ({ type: 'task', id: x.id, label: x.title }))
      return { results: [...p, ...t] }
    },
  }
}
