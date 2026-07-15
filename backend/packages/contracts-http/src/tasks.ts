// @linx/contracts-http · Tasks BC 契约（Zod）— 冻结现网 tasks/ideas/nonTodos 的请求/响应形状。
// 与前端 TS 1:1；请求解析默认 strip 未知字段（承接现网「多余字段忽略」）。
import { z } from 'zod'

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'archived'])
export const PrivacyScopeSchema = z.enum(['work', 'personal', 'mixed'])
export const NonDestinationSchema = z.enum(['archive', 'copy', 'export', 'discard'])
export const IdeaStatusSchema = z.enum(['clarifying', 'converted', 'archived', 'discarded'])

// ── 响应 DTO（= 现网 toTask/toIdea/toNon/toRecord 映射形状）──

export const TaskDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string(),
  status: TaskStatusSchema,
  projectId: z.string().nullable(),
  tags: z.array(z.string()),
  context: z.string(),
  dueAt: z.string().nullable(),
  plannedAt: z.string().nullable(),
  durationMinutes: z.number().nullable(),
  priority: z.number().int(),
  privacyScope: PrivacyScopeSchema,
  sourceIdeaId: z.string().nullable(),
  assignee: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type TaskDto = z.infer<typeof TaskDtoSchema>

export const IdeaDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  rawText: z.string(),
  status: IdeaStatusSchema,
  suggestedNextAction: z.string(),
  aiReason: z.string(),
  privacyScope: PrivacyScopeSchema,
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type IdeaDto = z.infer<typeof IdeaDtoSchema>

export const NonTodoDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  rawText: z.string(),
  reason: z.string(),
  suggestedDestination: NonDestinationSchema,
  privacyScope: PrivacyScopeSchema,
  source: z.string(),
  corrected: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type NonTodoDto = z.infer<typeof NonTodoDtoSchema>

export const CaptureRecordDtoSchema = z.object({
  id: z.string(),
  rawInput: z.string(),
  source: z.string(),
  aiKind: z.enum(['task', 'todo_idea', 'non_todo']),
  confidence: z.number().nullable(),
  aiReason: z.string(),
  resultEntityType: z.string().nullable(),
  resultEntityId: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
})
export type CaptureRecordDto = z.infer<typeof CaptureRecordDtoSchema>

// ── 请求 DTO ──

export const CreateTaskReqSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  status: TaskStatusSchema.optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  context: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  plannedAt: z.string().nullable().optional(),
  durationMinutes: z.number().nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  privacyScope: PrivacyScopeSchema.optional(),
  sourceIdeaId: z.string().nullable().optional(),
})
export type CreateTaskReq = z.infer<typeof CreateTaskReqSchema>

export const PatchTaskReqSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  status: TaskStatusSchema.optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  context: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  plannedAt: z.string().nullable().optional(),
  durationMinutes: z.number().nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  privacyScope: PrivacyScopeSchema.optional(),
  sourceIdeaId: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
})
export type PatchTaskReq = z.infer<typeof PatchTaskReqSchema>

export const TaskListQuerySchema = z.object({
  view: z.string().optional(),
  scope: z.string().optional(),
  search: z.string().optional(),
})
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>

// GET /api/tasks/:id 响应
export const TaskWithRecordDtoSchema = z.object({
  task: TaskDtoSchema,
  generationRecord: CaptureRecordDtoSchema.nullable(),
})
export type TaskWithRecordDto = z.infer<typeof TaskWithRecordDtoSchema>
