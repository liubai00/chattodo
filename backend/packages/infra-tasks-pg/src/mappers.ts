// @linx/infra-tasks-pg · row ↔ domain 显式映射（snake_case → camelCase）。
// 逐字段承接现网 repositories toTask/toIdea/toNon/toRecord。
import type {
  Task,
  TodoIdea,
  NonTodo,
  CaptureRecord,
  Subtask,
  Comment,
  Activity,
  Priority,
} from '@linx/domain-tasks'

type Row = Record<string, unknown>

const str = (v: unknown): string => (v == null ? '' : String(v))
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v))
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  try {
    const parsed: unknown = JSON.parse(str(v) || '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function rowToTask(r: Row): Task {
  return {
    id: str(r.id),
    title: str(r.title),
    notes: str(r.notes),
    status: str(r.status) as Task['status'],
    projectId: strOrNull(r.project_id),
    tags: parseTags(r.tags),
    context: str(r.context),
    dueAt: strOrNull(r.due_at),
    plannedAt: strOrNull(r.planned_at),
    durationMinutes: numOrNull(r.duration_minutes),
    priority: Number(r.priority) as Priority,
    privacyScope: str(r.privacy_scope) as Task['privacyScope'],
    sourceIdeaId: strOrNull(r.source_idea_id),
    assignee: strOrNull(r.assignee),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}

export function rowToIdea(r: Row): TodoIdea {
  return {
    id: str(r.id),
    title: str(r.title),
    rawText: str(r.raw_text),
    status: str(r.status) as TodoIdea['status'],
    suggestedNextAction: str(r.suggested_next_action),
    aiReason: str(r.ai_reason),
    privacyScope: str(r.privacy_scope) as TodoIdea['privacyScope'],
    source: str(r.source),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}

export function rowToNon(r: Row): NonTodo {
  return {
    id: str(r.id),
    title: str(r.title),
    summary: str(r.summary),
    rawText: str(r.raw_text),
    reason: str(r.reason),
    suggestedDestination: str(r.suggested_destination) as NonTodo['suggestedDestination'],
    privacyScope: str(r.privacy_scope) as NonTodo['privacyScope'],
    source: str(r.source),
    corrected: Boolean(r.corrected),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}

export function rowToSubtask(r: Row): Subtask {
  return { id: str(r.id), text: str(r.text), done: Boolean(r.done), createdAt: str(r.created_at) }
}

export function rowToComment(r: Row): Comment {
  return {
    id: str(r.id),
    author: str(r.author),
    text: str(r.text),
    createdAt: str(r.created_at),
  }
}

export function rowToActivity(r: Row): Activity {
  return { id: str(r.id), text: str(r.text), createdAt: str(r.created_at) }
}

export function rowToRecord(r: Row): CaptureRecord {
  return {
    id: str(r.id),
    rawInput: str(r.raw_input),
    source: str(r.source),
    aiKind: str(r.ai_kind) as CaptureRecord['aiKind'],
    confidence: numOrNull(r.confidence),
    aiReason: str(r.ai_reason),
    resultEntityType: strOrNull(r.result_entity_type),
    resultEntityId: strOrNull(r.result_entity_id),
    status: str(r.status),
    createdAt: str(r.created_at),
  }
}
