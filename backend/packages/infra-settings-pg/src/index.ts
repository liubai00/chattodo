// @linx/infra-settings-pg — app_settings + agent_profile 仓储（1:1 承接 repositories.settings/agent）。
// 均为 UPDATE-only（行由 bootstrap 预置）；动态 SET 仅含 patch 中出现的键。
import type {
  AppSettings,
  AppSettingsPatch,
  AgentProfile,
  AgentProfilePatch,
  FriendPolicy,
  SettingsRepo,
  AgentRepo,
} from '@linx/domain-settings'

export const SETTINGS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS app_settings (
    user_id TEXT PRIMARY KEY DEFAULT 'u_default',
    workspace_mode TEXT NOT NULL DEFAULT 'work',
    privacy_mode INTEGER NOT NULL DEFAULT 0,
    default_view TEXT NOT NULL DEFAULT 'dashboard',
    ai_visibility TEXT NOT NULL DEFAULT 'visible_scope_only',
    notif_prefs TEXT NOT NULL DEFAULT '{}',
    theme TEXT NOT NULL DEFAULT 'light',
    friend_policy TEXT NOT NULL DEFAULT 'open',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_profile (
    user_id TEXT PRIMARY KEY DEFAULT 'u_default',
    soul TEXT NOT NULL DEFAULT '',
    memory TEXT NOT NULL DEFAULT '',
    preferences TEXT NOT NULL DEFAULT '',
    working_style TEXT NOT NULL DEFAULT '',
    privacy_rules TEXT NOT NULL DEFAULT '',
    default_followup_strategy TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface SettingsRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))

function toSettings(r: Record<string, unknown> | undefined): AppSettings | undefined {
  if (!r) return undefined
  let notifPrefs: Record<string, unknown> = {}
  try {
    notifPrefs = JSON.parse(s(r.notif_prefs) || '{}')
  } catch {
    /* keep {} */
  }
  return {
    workspaceMode: s(r.workspace_mode),
    privacyMode: Number(r.privacy_mode) === 1,
    defaultView: s(r.default_view),
    aiVisibility: s(r.ai_visibility),
    notifPrefs,
    theme: s(r.theme) || 'light',
    friendPolicy: (r.friend_policy === 'closed' ? 'closed' : 'open') as FriendPolicy,
    updatedAt: s(r.updated_at),
  }
}

function toAgent(r: Record<string, unknown> | undefined): AgentProfile | undefined {
  if (!r) return undefined
  return {
    soul: s(r.soul),
    memory: s(r.memory),
    preferences: s(r.preferences),
    workingStyle: s(r.working_style),
    privacyRules: s(r.privacy_rules),
    defaultFollowupStrategy: s(r.default_followup_strategy),
    updatedAt: s(r.updated_at),
  }
}

export function makeSettingsRepo(deps: SettingsRepoDeps): SettingsRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const MAP: Array<[keyof AppSettingsPatch, string]> = [
    ['workspaceMode', 'workspace_mode'],
    ['privacyMode', 'privacy_mode'],
    ['defaultView', 'default_view'],
    ['aiVisibility', 'ai_visibility'],
    ['notifPrefs', 'notif_prefs'],
    ['theme', 'theme'],
    ['friendPolicy', 'friend_policy'],
  ]
  const serialize = (k: keyof AppSettingsPatch, v: unknown): unknown =>
    k === 'privacyMode'
      ? v
        ? 1
        : 0
      : k === 'notifPrefs'
        ? JSON.stringify(v || {})
        : k === 'friendPolicy'
          ? v === 'closed'
            ? 'closed'
            : 'open' // 白名单，非法值回退 open
          : v

  const get = async (): Promise<AppSettings | undefined> =>
    toSettings((await db.execute('SELECT * FROM app_settings WHERE user_id = $1', [userId]))[0])

  return {
    get,
    async update(patch: AppSettingsPatch): Promise<AppSettings | undefined> {
      const sets: string[] = []
      const vals: unknown[] = []
      const push = (col: string, v: unknown): void => {
        vals.push(v)
        sets.push(`${col} = $${vals.length}`)
      }
      for (const [k, col] of MAP) {
        if (k in patch) push(col, serialize(k, patch[k]))
      }
      push('updated_at', nowIso())
      vals.push(userId)
      await db.execute(`UPDATE app_settings SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals)
      return get()
    },
  }
}

export function makeAgentRepo(deps: SettingsRepoDeps): AgentRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const MAP: Array<[keyof AgentProfilePatch, string]> = [
    ['soul', 'soul'],
    ['memory', 'memory'],
    ['preferences', 'preferences'],
    ['workingStyle', 'working_style'],
    ['privacyRules', 'privacy_rules'],
    ['defaultFollowupStrategy', 'default_followup_strategy'],
  ]

  const get = async (): Promise<AgentProfile | undefined> =>
    toAgent((await db.execute('SELECT * FROM agent_profile WHERE user_id = $1', [userId]))[0])

  return {
    get,
    async update(patch: AgentProfilePatch): Promise<AgentProfile | undefined> {
      const sets: string[] = []
      const vals: unknown[] = []
      const push = (col: string, v: unknown): void => {
        vals.push(v)
        sets.push(`${col} = $${vals.length}`)
      }
      for (const [k, col] of MAP) {
        if (k in patch) push(col, patch[k])
      }
      push('updated_at', nowIso())
      vals.push(userId)
      await db.execute(`UPDATE agent_profile SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals)
      return get()
    },
  }
}
