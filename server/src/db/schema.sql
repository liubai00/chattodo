-- Chattodo schema. All business tables carry user_id (default 'u_default')
-- so multi-user can be layered on later without a migration.

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'u_default',
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',
  privacy_scope TEXT NOT NULL DEFAULT 'work',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL DEFAULT 'u_default',
  title            TEXT NOT NULL,
  notes            TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'todo',      -- todo | in_progress | done | archived
  project_id       TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',         -- JSON array of strings
  context          TEXT NOT NULL DEFAULT '',
  due_at           TEXT,
  planned_at       TEXT,
  duration_minutes INTEGER,
  priority         INTEGER NOT NULL DEFAULT 3,         -- 1..4
  privacy_scope    TEXT NOT NULL DEFAULT 'work',       -- work | personal | mixed
  source_idea_id   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_ideas (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL DEFAULT 'u_default',
  title                 TEXT NOT NULL,
  raw_text              TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'clarifying', -- clarifying | converted | archived | discarded
  suggested_next_action TEXT NOT NULL DEFAULT '',
  ai_reason             TEXT NOT NULL DEFAULT '',
  privacy_scope         TEXT NOT NULL DEFAULT 'work',
  source                TEXT NOT NULL DEFAULT 'chat',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS non_todo_outputs (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL DEFAULT 'u_default',
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL DEFAULT '',
  raw_text              TEXT NOT NULL DEFAULT '',
  reason                TEXT NOT NULL DEFAULT '',
  suggested_destination TEXT NOT NULL DEFAULT 'archive', -- archive | copy | export | discard
  privacy_scope         TEXT NOT NULL DEFAULT 'work',
  source                TEXT NOT NULL DEFAULT 'chat',
  corrected             INTEGER NOT NULL DEFAULT 0,        -- 1 if it arrived here via "move out of todo"
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_profile (
  user_id                   TEXT PRIMARY KEY DEFAULT 'u_default',
  soul                      TEXT NOT NULL DEFAULT '',
  memory                    TEXT NOT NULL DEFAULT '',
  preferences               TEXT NOT NULL DEFAULT '',
  working_style             TEXT NOT NULL DEFAULT '',
  privacy_rules             TEXT NOT NULL DEFAULT '',
  default_followup_strategy TEXT NOT NULL DEFAULT '',
  updated_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  user_id        TEXT PRIMARY KEY DEFAULT 'u_default',
  workspace_mode TEXT NOT NULL DEFAULT 'work',          -- work | personal
  privacy_mode   INTEGER NOT NULL DEFAULT 0,
  default_view   TEXT NOT NULL DEFAULT 'dashboard',
  ai_visibility  TEXT NOT NULL DEFAULT 'visible_scope_only',
  updated_at     TEXT NOT NULL
);

-- Raw input + AI generation record for every capture (traceability).
CREATE TABLE IF NOT EXISTS capture_records (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL DEFAULT 'u_default',
  raw_input          TEXT NOT NULL,
  source             TEXT NOT NULL DEFAULT 'chat',
  ai_kind            TEXT NOT NULL,                      -- task | todo_idea | non_todo
  confidence         REAL,
  ai_reason          TEXT NOT NULL DEFAULT '',
  result_entity_type TEXT,
  result_entity_id   TEXT,
  status             TEXT NOT NULL DEFAULT 'ok',
  created_at         TEXT NOT NULL
);

-- User corrections (e.g. "move out of todo").
CREATE TABLE IF NOT EXISTS corrections (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'u_default',
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  from_kind   TEXT,
  to_kind     TEXT,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

-- AI failures (visible to user as retryable; future admin error counts).
CREATE TABLE IF NOT EXISTS ai_errors (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'u_default',
  raw_input  TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'u_default',
  role       TEXT NOT NULL,                              -- user | agent
  text       TEXT NOT NULL,
  is_error   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Runtime AI provider config (singleton). Lets the app switch third-party models.
CREATE TABLE IF NOT EXISTS ai_config (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  provider         TEXT NOT NULL DEFAULT 'rule',        -- rule | openai | anthropic
  base_url         TEXT NOT NULL DEFAULT '',
  model            TEXT NOT NULL DEFAULT '',
  api_key          TEXT NOT NULL DEFAULT '',
  fallback_to_rule INTEGER NOT NULL DEFAULT 1,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user    ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_user    ON todo_ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_nons_user     ON non_todo_outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_records_user  ON capture_records(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_user     ON chat_messages(user_id);
