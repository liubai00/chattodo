// @linx/app-projects — Projects use-case（列表 / 创建 / 重名判定）。承接现网 routes/projects.js + capture 归属。
import { matchProjectId, type ProjectRepo, type Project, type NewProjectInput } from '@linx/domain-projects'

export interface ProjectsAppDeps {
  projects: ProjectRepo
}

export interface ProjectsApp {
  listProjects(): Promise<Project[]>
  /** 是否已存在同名项目（精确匹配，承接现网 409 判定）。 */
  nameExists(name: string): Promise<boolean>
  createProject(input: NewProjectInput): Promise<Project>
  /** 智能归属：文本命中的项目 id（无则 null）。 */
  projectIdForText(text: string): Promise<string | null>
}

export function makeProjectsApp(deps: ProjectsAppDeps): ProjectsApp {
  return {
    listProjects() {
      return deps.projects.all()
    },
    async nameExists(name) {
      return (await deps.projects.all()).some((p) => p.name === name)
    },
    createProject(input) {
      return deps.projects.create(input)
    },
    async projectIdForText(text) {
      return matchProjectId(await deps.projects.all(), text)
    },
  }
}
