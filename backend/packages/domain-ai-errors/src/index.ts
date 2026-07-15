// @linx/domain-ai-errors — AI 失败留痕模型 + 端口（承接 repositories.aiErrors）。

export interface AiError {
  id: string
  rawInput: string
  message: string
  createdAt: string
}

export interface AiErrorInput {
  id?: string
  rawInput?: string
  message?: string
}

export interface AiErrorRepo {
  /** 记一条 AI 失败（triage/chat LLM 报错时）；返回 id。 */
  create(data: AiErrorInput): Promise<string>
  /** 当前用户全部错误，created_at DESC（admin 用；admin 路由目前走原始 SQL）。 */
  all(): Promise<AiError[]>
}
