// @linx/domain-projects — Project 模型 + 端口 + 智能归属规则（纯，零 I/O）。
// 承接现网 repositories toProject/projects.* 与 services/capture.js matchProjectId。

export type PrivacyScope = 'work' | 'personal' | 'mixed'

export interface Project {
  id: string
  name: string
  description: string
  status: string
  privacyScope: PrivacyScope
  createdAt: string
  updatedAt: string
}

export interface NewProjectInput {
  id?: string
  name: string
  description?: string
  status?: string
  privacyScope?: PrivacyScope
}

export interface ProjectRepo {
  all(): Promise<Project[]>
  get(id: string): Promise<Project | undefined>
  create(input: NewProjectInput): Promise<Project>
}

/**
 * 智能项目归属：输入文本里包含某项目名（≥2 字、大小写不敏感）→ 返回该项目 id，否则 null。
 * 承接现网 services/capture.js matchProjectId（取首个命中）。
 */
export function matchProjectId(projects: readonly Project[], text: string): string | null {
  const t = String(text ?? '').toLowerCase()
  if (!t) return null
  const hit = projects.find(
    (p) => p.name.length >= 2 && t.includes(p.name.toLowerCase()),
  )
  return hit ? hit.id : null
}
