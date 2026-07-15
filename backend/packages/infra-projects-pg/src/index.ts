// @linx/infra-projects-pg — Projects 仓储（镜像现网 schema.sql projects 表 + repositories projects.*）。
import { makePrefixedId } from '@linx/kernel-ids'
import type { Project, ProjectRepo, NewProjectInput } from '@linx/domain-projects'

export const PROJECTS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    privacy_scope TEXT NOT NULL DEFAULT 'work',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface ProjectRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')

function rowToProject(r: Record<string, unknown>): Project {
  const s = (v: unknown): string => (v == null ? '' : String(v))
  return {
    id: s(r.id),
    name: s(r.name),
    description: s(r.description),
    status: s(r.status),
    privacyScope: s(r.privacy_scope) as Project['privacyScope'],
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
  }
}

export function makeProjectRepo(deps: ProjectRepoDeps): ProjectRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  const selectOne = async (id: string): Promise<Project | undefined> => {
    const rows = await db.execute('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ])
    return rows[0] ? rowToProject(rows[0]) : undefined
  }

  return {
    async all(): Promise<Project[]> {
      const rows = await db.execute(
        'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at, id',
        [userId],
      )
      return rows.map(rowToProject)
    },

    get: selectOne,

    async create(input: NewProjectInput): Promise<Project> {
      const id = input.id ?? genId('proj')
      const ts = nowIso()
      await db.execute(
        `INSERT INTO projects (id,user_id,name,description,status,privacy_scope,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          userId,
          input.name,
          input.description ?? '',
          input.status ?? 'active',
          input.privacyScope ?? 'work',
          ts,
          ts,
        ],
      )
      const created = await selectOne(id)
      if (!created) throw new Error('project create failed')
      return created
    },
  }
}
