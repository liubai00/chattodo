// @linx/app-capture — Capture 闭环（规则版）：triage → 建实体 + 生成记录 + activity。
// 承接现网 services/capture.js persistCapture。LLM triage 暂留 legacy（P7 才迁），本包只走规则引擎。
import { triageInputSync, type TriageResult } from '@linx/agent-planner-rule'
import type {
  TaskRepo,
  IdeaRepo,
  NonTodoRepo,
  CaptureRecordRepo,
  ActivityRepo,
  AiKind,
  NonDestination,
  Priority,
} from '@linx/domain-tasks'

export interface CaptureAppDeps {
  tasks: TaskRepo
  ideas: IdeaRepo
  nonTodos: NonTodoRepo
  captureRecords: CaptureRecordRepo
  activity: ActivityRepo
  /** 智能项目归属（来自 app-projects.projectIdForText）。 */
  projectIdForText: (text: string) => Promise<string | null>
  now?: () => number
}

export interface CaptureOutcome {
  result: TriageResult
  entityType: AiKind
  entity: unknown
}

export interface CaptureApp {
  capture(input: { text: string; source?: string }): Promise<CaptureOutcome>
}

export function makeCaptureApp(deps: CaptureAppDeps): CaptureApp {
  const now = deps.now ?? ((): number => Date.now())

  return {
    async capture({ text, source = 'web' }): Promise<CaptureOutcome> {
      const result = triageInputSync(text, now())

      if (result.kind === 'task') {
        const projectId = await deps.projectIdForText(text)
        const entity = await deps.tasks.create({
          title: result.title,
          notes: '',
          status: 'todo',
          projectId,
          tags: result.tags ?? [],
          context: result.context ?? '',
          dueAt: result.dueAt ?? null,
          plannedAt: result.plannedAt ?? null,
          durationMinutes: result.durationMinutes ?? 30, // 承接现网 || 30
          priority: (result.priority ?? 3) as Priority,
          privacyScope: result.privacyScope,
          sourceIdeaId: null,
        })
        await deps.captureRecords.create({
          rawInput: text,
          source,
          aiKind: 'task',
          confidence: result.confidence,
          aiReason: result.reason,
          resultEntityType: 'task',
          resultEntityId: entity.id,
          status: 'ok',
        })
        await deps.activity.log(entity.id, '任务已创建（来自聊天输入）')
        return { result, entityType: 'task', entity }
      }

      if (result.kind === 'todo_idea') {
        const entity = await deps.ideas.create({
          title: result.title,
          rawText: text,
          status: 'clarifying',
          suggestedNextAction: result.suggestedNextAction,
          aiReason: result.reason,
          privacyScope: result.privacyScope,
          source,
        })
        await deps.captureRecords.create({
          rawInput: text,
          source,
          aiKind: 'todo_idea',
          confidence: result.confidence,
          aiReason: result.reason,
          resultEntityType: 'todo_idea',
          resultEntityId: entity.id,
          status: 'ok',
        })
        return { result, entityType: 'todo_idea', entity }
      }

      const entity = await deps.nonTodos.create({
        title: result.title,
        summary: result.summary,
        rawText: text,
        reason: result.reason,
        suggestedDestination: result.suggestedDestination as NonDestination,
        privacyScope: result.privacyScope,
        source,
      })
      await deps.captureRecords.create({
        rawInput: text,
        source,
        aiKind: 'non_todo',
        confidence: result.confidence,
        aiReason: result.reason,
        resultEntityType: 'non_todo',
        resultEntityId: entity.id,
        status: 'ok',
      })
      return { result, entityType: 'non_todo', entity }
    },
  }
}
