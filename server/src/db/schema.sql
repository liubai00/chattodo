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
  assignee         TEXT,
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
  notif_prefs    TEXT NOT NULL DEFAULT '{}',            -- JSON {assign,due,fail,done:bool}
  theme          TEXT NOT NULL DEFAULT 'light',         -- light | dark
  friend_policy  TEXT NOT NULL DEFAULT 'open',          -- open | closed（谢绝陌生人好友请求）
  updated_at     TEXT NOT NULL
);
-- 已存在的库补列（CREATE IF NOT EXISTS 不会给老表加列）
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS friend_policy TEXT NOT NULL DEFAULT 'open';

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
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'u_default',
  conversation_id TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL,                          -- user | agent
  text            TEXT NOT NULL,
  is_error        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

-- 多对话：每个用户可有多个会话线程；消息归属某个会话。
-- （回填放在 users 表创建之后，见下方）
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '新对话',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_messages(conversation_id, created_at);

-- Accounts + sessions (registration / login).
-- name         = 称呼（display / salutation）：聊天、问候、通知、@提及都用它。
-- account_name = 账户名（identity）：唯一标识 / 系统账号展示（登录仍用 email）。
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  account_name  TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',   -- admin | member | viewer
  created_at    TEXT NOT NULL
);
-- 老库补列 + 回填：存量用户账户名默认等于其称呼。
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT '';
UPDATE users SET account_name = name WHERE account_name = '' OR account_name IS NULL;

-- 多对话回填（依赖 users 已存在）：每个用户一个默认会话 conv_<userId>，历史消息归入其中。
INSERT INTO conversations (id, user_id, title, created_at, updated_at)
  SELECT 'conv_' || id, id, '默认对话', created_at, created_at FROM users
  WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.user_id = users.id);
UPDATE chat_messages SET conversation_id = 'conv_' || user_id WHERE conversation_id = '' OR conversation_id IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Task detail: subtasks, comments, activity log.
CREATE TABLE IF NOT EXISTS subtasks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'u_default',
  task_id    TEXT NOT NULL,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'u_default',
  task_id    TEXT NOT NULL,
  author     TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'u_default',
  task_id    TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'u_default',
  type        TEXT,
  icon        TEXT,
  color       TEXT,
  text        TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  action_type TEXT,                        -- e.g. 'invite' → renders accept/decline buttons
  action_ref  TEXT,                        -- id the action operates on (collaborator row id)
  handled     INTEGER NOT NULL DEFAULT 0,  -- action consumed (buttons gray out)
  created_at  TEXT NOT NULL
);

-- 任务协作（邀请-确认制）：任务仍归 owner，接受后协作者获得同一条任务的读写视图。
CREATE TABLE IF NOT EXISTS task_collaborators (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  owner_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,              -- 被邀请成员
  invited_by   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | left
  remind       INTEGER NOT NULL DEFAULT 1,      -- 接受时选择：纳入我的提醒/规划
  created_at   TEXT NOT NULL,
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_collab_task ON task_collaborators(task_id);
CREATE INDEX IF NOT EXISTS idx_collab_user ON task_collaborators(user_id);

-- 好友关系（每对用户全局唯一一行）：requester 发起、addressee 响应。
-- 只有已接受的好友之间才能 @提及 / 指派 / 协作邀请（服务端强制）。
CREATE TABLE IF NOT EXISTS friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  created_at   TEXT NOT NULL,
  responded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requester ON friendships(requester_id, status);

-- 记忆驱动的自动化规则（"以后合同类任务都邀请张伟"）。
CREATE TABLE IF NOT EXISTS auto_rules (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  keyword     TEXT NOT NULL,               -- 命中任务标题/原文的关键词
  action      TEXT NOT NULL DEFAULT 'invite',
  target_id   TEXT NOT NULL,               -- 动作对象（成员 userId）
  target_name TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_autorules_user ON auto_rules(user_id);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_task ON activity(task_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);

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
