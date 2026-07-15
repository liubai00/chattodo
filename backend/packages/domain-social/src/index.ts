// @linx/domain-social — 好友关系模型 + 端口 + 总览归类（纯）。承接现网 services/friends.js。
// 规则：双向、每对全局唯一一行；邮箱精确匹配；反向 pending 自动成友；declined 可重发；解除不影响既有协作。

export type FriendStatus = 'pending' | 'accepted' | 'declined'

export interface Friendship {
  id: string
  requesterId: string
  addresseeId: string
  status: FriendStatus
  createdAt: string
  respondedAt: string | null
}

/** listForUser 的连接行（含对方 users 展示信息，LEFT JOIN）。 */
export interface FriendshipRow extends Friendship {
  requesterName: string | null
  requesterEmail: string | null
  addresseeName: string | null
  addresseeEmail: string | null
}

export interface FriendParty {
  id: string
  name: string
  email: string
}
export interface FriendEntry extends FriendParty {
  friendshipId: string
  since: string
}
export interface PendingEntry extends FriendParty {
  friendshipId: string
  at: string
}
export interface FriendsOverview {
  friends: FriendEntry[]
  incoming: PendingEntry[]
  outgoing: PendingEntry[]
}

export interface FriendshipRepo {
  /** 无向查一对用户之间的关系。 */
  findPair(a: string, b: string): Promise<Friendship | undefined>
  findById(id: string): Promise<Friendship | undefined>
  /** 某用户参与的全部关系（含对方 users 名字/邮箱），created_at DESC。 */
  listForUser(userId: string): Promise<FriendshipRow[]>
  /** 已接受关系里 userId 的好友 id 列表。 */
  acceptedFriendIds(userId: string): Promise<string[]>
  insertPending(requesterId: string, addresseeId: string): Promise<Friendship>
  setStatus(id: string, status: FriendStatus): Promise<void>
  /** declined 后重新发起：翻转方向、置 pending、清 responded_at。 */
  reRequest(id: string, requesterId: string, addresseeId: string): Promise<void>
  remove(id: string): Promise<void>
}

/** 好友总览归类（承接现网 friendsOverview：accepted / 待我处理(incoming) / 我已发出(outgoing)）。 */
export function categorizeOverview(rows: readonly FriendshipRow[], userId: string): FriendsOverview {
  const friends: FriendEntry[] = []
  const incoming: PendingEntry[] = []
  const outgoing: PendingEntry[] = []
  for (const f of rows) {
    const iAmRequester = f.requesterId === userId
    const other: FriendParty = iAmRequester
      ? { id: f.addresseeId, name: f.addresseeName || '（已注销）', email: f.addresseeEmail || '' }
      : { id: f.requesterId, name: f.requesterName || '（已注销）', email: f.requesterEmail || '' }
    if (f.status === 'accepted') {
      friends.push({ friendshipId: f.id, ...other, since: f.respondedAt || f.createdAt })
    } else if (f.status === 'pending' && !iAmRequester) {
      incoming.push({ friendshipId: f.id, ...other, at: f.createdAt })
    } else if (f.status === 'pending' && iAmRequester) {
      outgoing.push({ friendshipId: f.id, ...other, at: f.createdAt })
    }
    // declined：双方都不展示（仅保留以允许重新发起）
  }
  friends.sort((x, y) => x.name.localeCompare(y.name, 'zh'))
  return { friends, incoming, outgoing }
}

/** 好友圈单点真理：a、b 是否已接受好友（自己与自己视为 true，承接现网 areFriends）。 */
export function isFriendPair(pair: Friendship | undefined, a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return !!(pair && pair.status === 'accepted')
}
