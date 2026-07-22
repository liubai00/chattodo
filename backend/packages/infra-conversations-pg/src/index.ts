// @linx/infra-conversations-pg — conversations + chat_messages 仓储（承接 repositories.conversations/chat）。
// 时间戳用 nowIsoMs（毫秒精度，供同分钟内会话/消息稳定排序）；chat 只读（发送属 P7 agent）。
import { makePrefixedId } from '@linx/kernel-ids'
import type {
  Conversation,
  ChatMessage,
  ConversationRepo,
  ChatReadRepo,
} from '@linx/domain-conversations'

export const CONVERSATIONS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    conversation_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    is_error INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface ConversationRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))

function toConv(r: Record<string, unknown> | undefined): Conversation | undefined {
  if (!r) return undefined
  return {
    id: s(r.id),
    title: s(r.title),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
    lastText: s(r.last_text),
    messageCount: Number(r.msg_count || 0),
  }
}
function toChat(r: Record<string, unknown>): ChatMessage {
  return {
    id: s(r.id),
    role: s(r.role),
    text: s(r.text),
    isError: Number(r.is_error) === 1,
    conversationId: s(r.conversation_id),
    createdAt: s(r.created_at),
  }
}

export function makeConversationRepo(deps: ConversationRepoDeps): ConversationRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIsoMs = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())
  const defaultConvId = `conv_${userId}`

  const get = async (id: string): Promise<Conversation | undefined> =>
    toConv((await db.execute('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]))[0])

  return {
    async list(): Promise<Conversation[]> {
      const rows = await db.execute(
        `SELECT c.*,
                (SELECT text FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_text,
                (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS msg_count
           FROM conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC`,
        [userId],
      )
      return rows.map((r) => toConv(r)!)
    },

    get,

    async latestId(): Promise<string | null> {
      const r = (
        await db.execute<{ id: string }>(
          'SELECT id FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
          [userId],
        )
      )[0]
      return r ? r.id : null
    },

    async ensureDefault(): Promise<string> {
      const ex = (await db.execute('SELECT id FROM conversations WHERE id = $1', [defaultConvId]))[0]
      if (!ex) {
        const ts = nowIsoMs()
        await db.execute(
          `INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ($1,$2,'默认对话',$3,$4)`,
          [defaultConvId, userId, ts, ts],
        )
      }
      return defaultConvId
    },

    async create(title: string): Promise<Conversation | undefined> {
      const id = genId('conv')
      const ts = nowIsoMs()
      await db.execute(
        `INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES ($1,$2,$3,$4,$5)`,
        [id, userId, String(title || '新对话').slice(0, 40), ts, ts],
      )
      return get(id)
    },

    async rename(id: string, title: string): Promise<Conversation | undefined> {
      await db.execute('UPDATE conversations SET title = $1, updated_at = $2 WHERE id = $3 AND user_id = $4', [
        String(title || '').slice(0, 40),
        nowIsoMs(),
        id,
        userId,
      ])
      return get(id)
    },

    async touch(id: string, maybeTitle?: string): Promise<void> {
      if (maybeTitle) {
        await db.execute(
          `UPDATE conversations SET updated_at = $1, title = CASE WHEN title IN ('新对话','默认对话') THEN $2 ELSE title END WHERE id = $3 AND user_id = $4`,
          [nowIsoMs(), String(maybeTitle).replace(/\s+/g, ' ').trim().slice(0, 24) || '新对话', id, userId],
        )
      } else {
        await db.execute('UPDATE conversations SET updated_at = $1 WHERE id = $2 AND user_id = $3', [
          nowIsoMs(),
          id,
          userId,
        ])
      }
    },

    async remove(id: string): Promise<void> {
      // 承 legacy db.tx（删消息 + 删会话）。此处顺序删除（Queryable 无事务原语）；
      // 先删消息再删会话，happy-path 等价，极端失败仅可能留下孤儿消息（可由清理任务兜底）。
      await db.execute('DELETE FROM chat_messages WHERE conversation_id = $1 AND user_id = $2', [id, userId])
      await db.execute('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [id, userId])
    },
  }
}

/** 聊天消息只读仓储：某会话的消息，created_at ASC（承 repos.chat.all）。 */
export function makeChatReadRepo(deps: { db: Queryable; userId: string }): ChatReadRepo {
  const { db, userId } = deps
  const defaultConvId = `conv_${userId}`
  return {
    async all(conversationId?: string): Promise<ChatMessage[]> {
      const rows = await db.execute(
        // 二级键 id：同毫秒行稳定全序（承现网主序 created_at，补确定性）。
        'SELECT * FROM chat_messages WHERE user_id = $1 AND conversation_id = $2 ORDER BY created_at, id',
        [userId, conversationId || defaultConvId],
      )
      return rows.map(toChat)
    },
  }
}

export interface ChatWriteRepo extends ChatReadRepo {
  /** 落一条消息（承 repos.chat.create）：INSERT chat_messages + 触碰会话 updated_at。 */
  create(data: {
    id?: string
    role: string
    text: string
    isError?: boolean
    conversationId?: string
  }): Promise<ChatMessage>
}

/** 聊天消息读写仓储（P7 聊天发送落库）。created_at 分精度，会话 updated_at 毫秒精度。 */
export function makeChatRepo(deps: ConversationRepoDeps): ChatWriteRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const nowIsoMs = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())
  const defaultConvId = `conv_${userId}`
  const read = makeChatReadRepo({ db, userId })

  return {
    all: read.all,
    async create(data): Promise<ChatMessage> {
      const id = data.id || genId('msg')
      const convId = data.conversationId || defaultConvId
      await db.execute(
        `INSERT INTO chat_messages (id,user_id,conversation_id,role,text,is_error,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, userId, convId, data.role, data.text, data.isError ? 1 : 0, nowIso()],
      )
      await db.execute('UPDATE conversations SET updated_at = $1 WHERE id = $2 AND user_id = $3', [
        nowIsoMs(),
        convId,
        userId,
      ])
      const row = (await db.execute('SELECT * FROM chat_messages WHERE id = $1', [id]))[0]
      return toChat(row!)
    },
  }
}
