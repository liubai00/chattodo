// @linx/infra-ai-config-pg — ai_config 仓储（1:1 承接 repositories.aiConfig）。
// 行：id='default'（团队）/ id='u:'+userId（个人覆盖）。upsert + 动态 UPDATE（仅 patch 键）。
import {
  AI_DEFAULTS,
  type AiConfig,
  type AiConfigPatch,
  type AiConfigRepo,
} from '@linx/domain-ai-config'

export const AI_CONFIG_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS ai_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    provider TEXT NOT NULL DEFAULT 'rule',
    base_url TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    fallback_to_rule INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface AiConfigRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))

function toAiConfig(r: Record<string, unknown> | undefined): AiConfig | undefined {
  if (!r) return undefined
  return {
    provider: s(r.provider),
    baseUrl: s(r.base_url),
    model: s(r.model),
    apiKey: s(r.api_key),
    fallbackToRule: Number(r.fallback_to_rule) === 1,
    updatedAt: r.updated_at == null ? null : String(r.updated_at),
  }
}

export function makeAiConfigRepo(deps: AiConfigRepoDeps): AiConfigRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const ownId = 'u:' + userId

  const rowOf = async (id: string): Promise<AiConfig | undefined> =>
    toAiConfig((await db.execute('SELECT * FROM ai_config WHERE id = $1', [id]))[0])

  const MAP: Array<[keyof AiConfigPatch, string]> = [
    ['provider', 'provider'],
    ['baseUrl', 'base_url'],
    ['model', 'model'],
    ['apiKey', 'api_key'],
    ['fallbackToRule', 'fallback_to_rule'],
  ]

  const aiWrite = async (rowId: string, patch: AiConfigPatch): Promise<void> => {
    await db.execute('INSERT INTO ai_config (id, updated_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
      rowId,
      nowIso(),
    ])
    const sets: string[] = []
    const vals: unknown[] = []
    const push = (col: string, v: unknown): void => {
      vals.push(v)
      sets.push(`${col} = $${vals.length}`)
    }
    for (const [k, col] of MAP) {
      if (k in patch) push(col, k === 'fallbackToRule' ? (patch[k] ? 1 : 0) : patch[k])
    }
    push('updated_at', nowIso())
    vals.push(rowId)
    await db.execute(`UPDATE ai_config SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
  }

  const getTeam = async (): Promise<AiConfig> => (await rowOf('default')) ?? { ...AI_DEFAULTS }
  const getOwn = async (): Promise<AiConfig | undefined> => rowOf(ownId)

  return {
    getTeam,
    getOwn,
    async get(): Promise<AiConfig> {
      return (await getOwn()) ?? getTeam()
    },
    async update(patch: AiConfigPatch): Promise<AiConfig> {
      await aiWrite('default', patch)
      return getTeam()
    },
    async updateOwn(patch: AiConfigPatch): Promise<AiConfig | undefined> {
      await aiWrite(ownId, patch)
      return getOwn()
    },
    async clearOwn(): Promise<void> {
      await db.execute('DELETE FROM ai_config WHERE id = $1', [ownId])
    },
  }
}
