// DDL bootstrap — 把全部 BC 的幂等建表语句(CREATE TABLE IF NOT EXISTS)按序应用到一个空库。
// 用途:① 本地 PGlite 零配置模式开机自建 schema;② 全新 Postgres 环境(如 compose down -v 后)
// 设 LINX_DDL_BOOTSTRAP=1 一次性初始化。对已有库安全:全部语句幂等,不改不删既有数据。
import { IDENTITY_DDL } from '@linx/infra-identity-pg'
import { SETTINGS_DDL } from '@linx/infra-settings-pg'
import { TASKS_DDL } from '@linx/infra-tasks-pg'
import { PROJECTS_DDL } from '@linx/infra-projects-pg'
import { SOCIAL_DDL } from '@linx/infra-social-pg'
import { COLLAB_DDL } from '@linx/infra-collab-pg'
import { NOTIFICATIONS_DDL } from '@linx/infra-notifications-pg'
import { CONVERSATIONS_DDL } from '@linx/infra-conversations-pg'
import { AI_CONFIG_DDL } from '@linx/infra-ai-config-pg'
import { AI_ERRORS_DDL } from '@linx/infra-ai-errors-pg'

/** sessions 表归 platform-auth 的 SessionStore 读写;现网建表在 legacy schema.sql,这里补齐权威 DDL。 */
const SESSIONS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
]

/** 全量 DDL,顺序:identity(users) 先行(多处 LEFT JOIN users),其余各 BC 幂等无相互依赖。 */
export const ALL_DDL: readonly string[] = [
  ...IDENTITY_DDL,
  ...SESSIONS_DDL,
  ...SETTINGS_DDL,
  ...TASKS_DDL,
  ...PROJECTS_DDL,
  ...SOCIAL_DDL,
  ...COLLAB_DDL,
  ...NOTIFICATIONS_DDL,
  ...CONVERSATIONS_DDL,
  ...AI_CONFIG_DDL,
  ...AI_ERRORS_DDL,
]

interface Executable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

/** 顺序应用全量 DDL(幂等,可重复调用)。 */
export async function bootstrapSchema(db: Executable): Promise<void> {
  for (const stmt of ALL_DDL) await db.execute(stmt)
}
