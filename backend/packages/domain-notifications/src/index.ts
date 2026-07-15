// @linx/domain-notifications — 通知模型 + 仓储端口（承接 repositories.notifications）。
// 通知的【写入】有两条现网路径：collab.pushNotification（跨用户，带 assign 默认 + publish）与
// repositories.notifications.create（低层，默认 null，不 publish）——本 BC 承接后者及读/标记。

export interface Notification {
  id: string
  type: string | null
  icon: string | null
  color: string | null
  text: string
  read: boolean
  actionType: string | null
  actionRef: string | null
  handled: boolean
  createdAt: string
}

/** notifications.create 的入参（低层写入；默认全 null，read 由入参决定）。 */
export interface NotificationInput {
  id?: string
  type?: string | null
  icon?: string | null
  color?: string | null
  text: string
  read?: boolean
  actionType?: string | null
  actionRef?: string | null
  createdAt?: string
}

export interface NotificationRepo {
  /** 当前用户全部通知，created_at DESC。 */
  all(): Promise<Notification[]>
  create(data: NotificationInput): Promise<Notification>
  markAllRead(): Promise<void>
  markRead(id: string): Promise<void>
  /** 把某 action_ref 相关通知置已处理 + 已读（限当前用户）。 */
  markHandledByRef(actionRef: string): Promise<void>
  /** 当天是否已存在同文案通知（到期提醒去重）。 */
  existsToday(text: string): Promise<boolean>
}
