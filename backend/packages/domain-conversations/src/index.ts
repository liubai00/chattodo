// @linx/domain-conversations — 多对话 + 聊天消息模型/端口（承接 repositories.conversations/chat）。

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastText: string
  messageCount: number
}

export interface ChatMessage {
  id: string
  role: string
  text: string
  isError: boolean
  conversationId: string
  createdAt: string
}

export interface ConversationRepo {
  /** 会话列表（含最后一条预览 + 消息数），updated_at DESC。 */
  list(): Promise<Conversation[]>
  get(id: string): Promise<Conversation | undefined>
  latestId(): Promise<string | null>
  /** 确保默认会话存在，返回其 id。 */
  ensureDefault(): Promise<string>
  create(title: string): Promise<Conversation | undefined>
  rename(id: string, title: string): Promise<Conversation | undefined>
  /** 首条消息自动命名（仅当标题仍是默认占位）+ 置顶（承 chat.js 调用点）。 */
  touch(id: string, maybeTitle?: string): Promise<void>
  /** 删除会话连同其消息。 */
  remove(id: string): Promise<void>
}

/** 聊天消息只读端口（发送/写入属 P7 agent；此处仅读某会话历史）。 */
export interface ChatReadRepo {
  all(conversationId?: string): Promise<ChatMessage[]>
}
