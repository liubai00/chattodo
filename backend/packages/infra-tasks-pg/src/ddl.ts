// @linx/infra-tasks-pg · DDL — 逐字段镜像现网 server/src/db/schema.sql 的 Tasks 相关表。
// Strangler 期与现网同库同表；drizzle-kit schema-as-code + 版本化迁移在 deploy-time 接入（见迁移计划 §5.1）。
// 用于测试建表与本地 bootstrap；生产表由现网 schema.sql 已建，此处仅作幂等 IF NOT EXISTS。

export const TASKS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    project_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    context TEXT NOT NULL DEFAULT '',
    due_at TEXT,
    planned_at TEXT,
    duration_minutes INTEGER,
    priority INTEGER NOT NULL DEFAULT 3,
    privacy_scope TEXT NOT NULL DEFAULT 'work',
    source_idea_id TEXT,
    assignee TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS todo_ideas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    title TEXT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'clarifying',
    suggested_next_action TEXT NOT NULL DEFAULT '',
    ai_reason TEXT NOT NULL DEFAULT '',
    privacy_scope TEXT NOT NULL DEFAULT 'work',
    source TEXT NOT NULL DEFAULT 'chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS non_todo_outputs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    raw_text TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    suggested_destination TEXT NOT NULL DEFAULT 'archive',
    privacy_scope TEXT NOT NULL DEFAULT 'work',
    source TEXT NOT NULL DEFAULT 'chat',
    corrected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS capture_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    raw_input TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'chat',
    ai_kind TEXT NOT NULL,
    confidence REAL,
    ai_reason TEXT NOT NULL DEFAULT '',
    result_entity_type TEXT,
    result_entity_id TEXT,
    status TEXT NOT NULL DEFAULT 'ok',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    from_kind TEXT,
    to_kind TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_collaborators (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    remind INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    responded_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ideas_user ON todo_ideas(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_nons_user ON non_todo_outputs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_collab_task ON task_collaborators(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_collab_user ON task_collaborators(user_id)`,
]
