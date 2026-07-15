// @linx/domain-settings — 应用设置 + 智能体档案模型/端口 + 可见性过滤（承接 repositories.settings/agent + privacy.js）。

export type WorkspaceMode = 'work' | 'personal'
export type FriendPolicy = 'open' | 'closed'

export interface AppSettings {
  workspaceMode: string
  privacyMode: boolean
  defaultView: string
  aiVisibility: string
  notifPrefs: Record<string, unknown>
  theme: string
  friendPolicy: FriendPolicy
  updatedAt: string
}

export interface AppSettingsPatch {
  workspaceMode?: string
  privacyMode?: boolean
  defaultView?: string
  aiVisibility?: string
  notifPrefs?: Record<string, unknown>
  theme?: string
  friendPolicy?: string
}

export interface AgentProfile {
  soul: string
  memory: string
  preferences: string
  workingStyle: string
  privacyRules: string
  defaultFollowupStrategy: string
  updatedAt: string
}

export interface AgentProfilePatch {
  soul?: string
  memory?: string
  preferences?: string
  workingStyle?: string
  privacyRules?: string
  defaultFollowupStrategy?: string
}

export interface SettingsRepo {
  get(): Promise<AppSettings | undefined>
  /** patch 合并（仅出现的键）+ updated_at；UPDATE-only（行由 bootstrap 预置）。 */
  update(patch: AppSettingsPatch): Promise<AppSettings | undefined>
}

export interface AgentRepo {
  get(): Promise<AgentProfile | undefined>
  update(patch: AgentProfilePatch): Promise<AgentProfile | undefined>
}

/**
 * 可见范围过滤（承 privacy.js / store.jsx visibleFilter）：隐私模式开启时，只显示当前工作区
 * （或 'mixed'）的条目。items 仅需带 privacyScope 字段。
 */
export function visibleFilter<T extends { privacyScope?: string }>(
  items: readonly T[],
  settings: { privacyMode: boolean; workspaceMode: string },
): T[] {
  if (!settings.privacyMode) return [...items]
  const mode = settings.workspaceMode
  return items.filter((it) => it.privacyScope === mode || it.privacyScope === 'mixed')
}
