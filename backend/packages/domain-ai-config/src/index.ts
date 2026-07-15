// @linx/domain-ai-config — 运行时 LLM 配置模型 + 端口（承接 repositories.aiConfig）。
// 语义：个人覆盖团队（getOwn > getTeam）；provider 自由字符串（只有 'anthropic' 分支，其余 openai 兼容；
// 'rule' 表示不接 LLM）。updatedAt 可空（默认行未写过）。

export interface AiConfig {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
  fallbackToRule: boolean
  updatedAt: string | null
}

export interface AiConfigPatch {
  provider?: string
  baseUrl?: string
  model?: string
  apiKey?: string
  fallbackToRule?: boolean
}

export const AI_DEFAULTS: AiConfig = {
  provider: 'rule',
  baseUrl: '',
  model: '',
  apiKey: '',
  fallbackToRule: true,
  updatedAt: null,
}

export interface AiConfigRepo {
  /** 团队配置（id='default'），无行时回落 AI_DEFAULTS。 */
  getTeam(): Promise<AiConfig>
  /** 个人覆盖配置（id='u:'+userId），无则 undefined。 */
  getOwn(): Promise<AiConfig | undefined>
  /** 生效配置：个人覆盖 > 团队。 */
  get(): Promise<AiConfig>
  /** 改团队配置（仅管理员，鉴权在路由层）。 */
  update(patch: AiConfigPatch): Promise<AiConfig>
  /** 改个人覆盖配置。 */
  updateOwn(patch: AiConfigPatch): Promise<AiConfig | undefined>
  /** 清除个人覆盖，回落团队。 */
  clearOwn(): Promise<void>
}
