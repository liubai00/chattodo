// @linx/agent-triage-llm — LLM 版 triage（包裹规则引擎 + platform-llm 客户端）。
// 选择器：配了非 rule provider 且有 apiKey → 走 LLM；否则规则同步版。
// mergeResult 把 LLM 的分类与确定性字段（日期/范围仍走规则）对齐，每个判别式都有安全兜底。
// LLM 报错向上抛（fallbackToRule 韧性留在消费方 chat/capture）。
import type { LlmClient, LlmConfig } from '@linx/platform-llm'
import {
  triageInputSync,
  detectDue,
  detectScope,
  makeTitle,
  type TriageResult,
  type PrivacyScope,
} from '@linx/agent-planner-rule'

export const TRIAGE_SYSTEM = `你是一个「todo-first」分类器。把用户输入判定为三类之一并只输出 JSON（不要解释、不要代码块）：
- task：有明确行动且可执行（有动作动词，通常有交付物或时间）。
- todo_idea：有行动倾向但缺目标/下一步/完成标准，需要澄清。
- non_todo：只是观点、灵感、摘录、参考，没有行动承诺。
输出字段：
{"kind":"task|todo_idea|non_todo","title":"<=24字标题","reason":"判定理由","confidence":0~1,"privacyScope":"work|personal|mixed",
 "priority":1-4(仅task),"tags":["..."](仅task),"durationMinutes":数字或null(仅task),
 "suggestedNextAction":"建议下一步(仅todo_idea)","summary":"摘要(仅non_todo)","suggestedDestination":"archive|copy|export|discard(仅non_todo)"}
只返回一个 JSON 对象。`

/** LLM 返回的（不可信）原始分类对象。 */
export interface TriageLlmOutput {
  kind?: string
  title?: string
  reason?: string
  confidence?: number
  privacyScope?: string
  priority?: number
  tags?: string[]
  durationMinutes?: number | null
  dueAt?: string | null
  suggestedNextAction?: string
  summary?: string
  suggestedDestination?: string
}

const SCOPES: PrivacyScope[] = ['work', 'personal', 'mixed']

/** 合并 LLM 分类与确定性字段（日期走规则 detectDue）。承接 llmProvider.mergeResult。 */
export function mergeResult(text: string, llm: TriageLlmOutput, nowMs: number = Date.now()): TriageResult {
  const kind = (['task', 'todo_idea', 'non_todo'].includes(llm.kind ?? '') ? llm.kind : 'non_todo') as TriageResult['kind']
  const scope: PrivacyScope = SCOPES.includes(llm.privacyScope as PrivacyScope)
    ? (llm.privacyScope as PrivacyScope)
    : detectScope(text)
  const common = {
    title: llm.title || makeTitle(text),
    reason: llm.reason || '',
    confidence: typeof llm.confidence === 'number' ? llm.confidence : 0.8,
    privacyScope: scope,
  }
  if (kind === 'task') {
    return {
      kind: 'task',
      ...common,
      dueAt: llm.dueAt ?? detectDue(text, nowMs),
      plannedAt: null,
      durationMinutes: typeof llm.durationMinutes === 'number' ? llm.durationMinutes : null,
      priority: [1, 2, 3, 4].includes(llm.priority as number) ? (llm.priority as number) : 3,
      tags: Array.isArray(llm.tags) ? llm.tags : [],
      context: scope === 'work' ? '电脑前' : '任意',
    }
  }
  if (kind === 'todo_idea') {
    return {
      kind: 'todo_idea',
      ...common,
      suggestedNextAction: llm.suggestedNextAction || '明确目标、下一步与完成标准。',
    }
  }
  return {
    kind: 'non_todo',
    ...common,
    summary: llm.summary || (text.length > 60 ? text.slice(0, 58) + '…' : text),
    suggestedDestination: ['archive', 'copy', 'export', 'discard'].includes(llm.suggestedDestination ?? '')
      ? (llm.suggestedDestination as string)
      : 'archive',
  }
}

export interface TriageService {
  /** 选择器：cfg 配了非 rule provider 且有 key → LLM，否则规则同步版。LLM 错误上抛。 */
  triageInput(text: string, cfg?: (LlmConfig & { provider?: string; apiKey?: string }) | null): Promise<TriageResult>
}

export interface TriageServiceDeps {
  llm: LlmClient
  now?: () => number
}

export function makeTriageService(deps: TriageServiceDeps): TriageService {
  const now = deps.now ?? ((): number => Date.now())
  return {
    async triageInput(text, cfg): Promise<TriageResult> {
      const nowMs = now()
      if (cfg && cfg.provider && cfg.provider !== 'rule' && cfg.apiKey) {
        const raw = (await deps.llm.messagesJson(TRIAGE_SYSTEM, [{ role: 'user', content: text }], cfg)) as
          | (TriageLlmOutput & { dueAt?: string | null })
          | null
        return mergeResult(text, raw ?? {}, nowMs)
      }
      return triageInputSync(text, nowMs)
    },
  }
}
