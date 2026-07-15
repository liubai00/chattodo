// @linx/app-social — 好友用例编排（忠实承接 server/src/services/friends.js）。
// 跨界作用（通知写入 / 事件扇出 / 用户查询 / 隐私策略读取）全部经注入端口，避免与 collab/notification/identity BC 形成编译期环。
import {
  categorizeOverview,
  isFriendPair,
  type FriendParty,
  type FriendStatus,
  type FriendsOverview,
  type FriendshipRepo,
} from '@linx/domain-social'

export interface FriendActor {
  id: string
  name?: string
}

/** 通知写入端口（承 collab.pushNotification 的形状）。 */
export interface SocialNotification {
  type: string
  icon: string
  color: string
  text: string
  actionType?: string
  actionRef?: string
}

export interface SocialNotifier {
  push(userId: string, n: SocialNotification): Promise<void>
  /** respond：把「我这边关于此请求的通知」置为已处理 + 已读。 */
  markHandledFor(actionRef: string, userId: string): Promise<void>
  /** remove：把「关于此关系的通知」全部置为已处理（避免点了报错）。 */
  markHandled(actionRef: string): Promise<void>
}

export interface UserLookup {
  byId(id: string): Promise<FriendParty | undefined>
  byEmailLower(emailLower: string): Promise<{ id: string } | undefined>
}

export interface SocialAppDeps {
  friendships: FriendshipRepo
  users: UserLookup
  notifier: SocialNotifier
  /** eventbus：publish(userId, { kind: 'friends' })。 */
  publishFriends: (userId: string) => void
  /** 对方是否设置「谢绝陌生人好友请求」（app_settings.friend_policy === 'closed'）。 */
  friendPolicyClosed: (userId: string) => Promise<boolean>
}

export type FriendRequestResult =
  | { error: string; code: string; target?: FriendParty }
  | { already: true; target: FriendParty }
  | { pending: true; target: FriendParty }
  | { friendship: { id: string; status: FriendStatus }; target: FriendParty; autoAccepted?: boolean }

export interface FriendRespondResult {
  friendship: { id: string; status: FriendStatus }
  requesterId: string
}

export interface FriendRemoveResult {
  removed: true
  otherId: string
  wasPending: boolean
}

export interface SocialApp {
  requestById(user: FriendActor, targetUserId: string): Promise<FriendRequestResult>
  requestByEmail(user: FriendActor, email: string): Promise<FriendRequestResult>
  respond(user: FriendActor, friendshipId: string, accept: boolean): Promise<FriendRespondResult | null>
  remove(user: FriendActor, friendshipId: string): Promise<FriendRemoveResult | null>
  overview(userId: string): Promise<FriendsOverview>
  isFriend(a: string, b: string): Promise<boolean>
  friendIds(userId: string): Promise<string[]>
}

export function makeSocialApp(deps: SocialAppDeps): SocialApp {
  const { friendships, users, notifier, publishFriends, friendPolicyClosed } = deps

  async function respond(
    user: FriendActor,
    friendshipId: string,
    accept: boolean,
  ): Promise<FriendRespondResult | null> {
    const f = await friendships.findById(friendshipId)
    if (!f || f.status !== 'pending' || f.addresseeId !== user.id) return null
    await friendships.setStatus(friendshipId, accept ? 'accepted' : 'declined')
    // 我这边的请求通知置为已处理（按钮变灰）
    await notifier.markHandledFor(friendshipId, user.id)
    const meName = user.name || '对方'
    if (accept) {
      const requester = await users.byId(f.requesterId)
      if (requester) {
        await notifier.push(requester.id, {
          type: 'friend',
          icon: 'ph-handshake',
          color: 'var(--accent)',
          text: `${meName} 通过了你的好友请求，现在可以互相 @提及与邀请协作了`,
        })
      }
      publishFriends(f.requesterId)
    }
    // 拒绝：不通知发起方（静默），仅刷新自己的界面
    publishFriends(user.id)
    return { friendship: { id: f.id, status: accept ? 'accepted' : 'declined' }, requesterId: f.requesterId }
  }

  async function requestById(user: FriendActor, targetUserId: string): Promise<FriendRequestResult> {
    const target = await users.byId(targetUserId)
    if (!target) return { error: '用户不存在', code: 'not_found' }
    if (target.id === user.id) return { error: '不能添加自己为好友', code: 'self' }
    const existing = await friendships.findPair(user.id, target.id)
    const meName = user.name || '有人'

    const notifyRequest = async (friendshipId: string): Promise<void> => {
      await notifier.push(target.id, {
        type: 'friend',
        icon: 'ph-user-plus',
        color: 'var(--accent-ink)',
        text: `${meName} 请求加你为好友（通过后可互相 @提及与邀请协作）`,
        actionType: 'friend_request',
        actionRef: friendshipId,
      })
      publishFriends(target.id)
    }

    if (!existing) {
      if (await friendPolicyClosed(target.id)) {
        return { error: `${target.name} 已设置谢绝陌生人好友请求，需要对方主动添加你`, code: 'closed', target }
      }
      const fr = await friendships.insertPending(user.id, target.id)
      await notifyRequest(fr.id)
      return { friendship: { id: fr.id, status: 'pending' }, target }
    }
    if (existing.status === 'accepted') return { already: true, target }
    if (existing.status === 'pending') {
      if (existing.requesterId === user.id) return { pending: true, target } // 幂等：已发过
      // 对方早已向我发出请求 → 互有意愿，直接成为好友（不受对方 closed 限制：请求正是对方发起的）
      const r = await respond(user, existing.id, true)
      return r
        ? { friendship: { id: existing.id, status: 'accepted' }, target, autoAccepted: true }
        : { error: '处理失败', code: 'conflict' }
    }
    // declined → 允许重新发起（方向翻转为当前发起人），同样受对方隐私策略约束
    if (await friendPolicyClosed(target.id)) {
      return { error: `${target.name} 已设置谢绝陌生人好友请求，需要对方主动添加你`, code: 'closed', target }
    }
    await friendships.reRequest(existing.id, user.id, target.id)
    await notifyRequest(existing.id)
    return { friendship: { id: existing.id, status: 'pending' }, target }
  }

  async function requestByEmail(user: FriendActor, email: string): Promise<FriendRequestResult> {
    const em = String(email || '').trim().toLowerCase()
    if (!em || !em.includes('@')) return { error: '请输入对方的完整邮箱', code: 'bad_email' }
    const target = await users.byEmailLower(em)
    if (!target) return { error: '没有找到使用该邮箱的用户，请确认对方已注册', code: 'not_found' }
    return requestById(user, target.id)
  }

  async function remove(user: FriendActor, friendshipId: string): Promise<FriendRemoveResult | null> {
    const f = await friendships.findById(friendshipId)
    if (!f) return null
    const isParty = f.requesterId === user.id || f.addresseeId === user.id
    if (!isParty) return null
    if (f.status === 'pending' && f.requesterId !== user.id) return null // 待处理请求只有发起方可撤回
    await friendships.remove(f.id)
    // 撤回请求时，对方的请求通知置为已处理，避免点了报错
    await notifier.markHandled(f.id)
    const otherId = f.requesterId === user.id ? f.addresseeId : f.requesterId
    publishFriends(otherId)
    publishFriends(user.id)
    return { removed: true, otherId, wasPending: f.status === 'pending' }
  }

  return {
    requestById,
    requestByEmail,
    respond,
    remove,
    async overview(userId: string): Promise<FriendsOverview> {
      return categorizeOverview(await friendships.listForUser(userId), userId)
    },
    async isFriend(a: string, b: string): Promise<boolean> {
      if (!a || !b) return false
      if (a === b) return true
      const pair = await friendships.findPair(a, b)
      return isFriendPair(pair, a, b)
    },
    async friendIds(userId: string): Promise<string[]> {
      return friendships.acceptedFriendIds(userId)
    },
  }
}
