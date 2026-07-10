// 好友域 composable：好友列表数据与操作（加载 / 添加 / 响应 / 解除）。
// notify 回调把成功/失败文案交回视图层展示（composable 不直接依赖 toast store）。
import { ref, computed } from 'vue'
import { AuthAPI } from '@/modules/auth/api'
import { FriendsAPI } from '@/modules/friends/api'
import { useAsyncLoad } from '@/shared/composables/useAsyncLoad'

export interface FriendItem {
  name: string
  email: string
  friendshipId: string
  since?: string
  at?: string
}

// api.friends() 实际返回结构（后端字段与 types/api.ts 的 Friend 不完全一致，按真实形状收窄，免 any）
interface FriendGroups {
  friends: FriendItem[]
  incoming: FriendItem[]
  outgoing: FriendItem[]
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : ''
}

export function useFriends(notify: (msg: string) => void) {
  const myEmail = ref('')
  const accepted = ref<FriendItem[]>([])
  const incoming = ref<FriendItem[]>([])
  const outgoing = ref<FriendItem[]>([])

  const { isLoading, execute: reload } = useAsyncLoad(async () => {
    const [me, f] = await Promise.all([AuthAPI.me(), FriendsAPI.friends()])
    myEmail.value = me.email || ''
    const g = f as unknown as FriendGroups
    accepted.value = g.friends || []
    incoming.value = g.incoming || []
    outgoing.value = g.outgoing || []
  }, { onError: () => notify('加载好友列表失败，请刷新重试') })

  async function add(email: string): Promise<boolean> {
    try {
      const r = await FriendsAPI.friendRequest(email) as unknown as { autoAccepted?: boolean; already?: boolean; pending?: boolean }
      notify(r.autoAccepted ? '你们互相发过请求 · 已直接成为好友' : r.already ? '你们已经是好友了' : r.pending ? '请求已在等待对方处理' : '好友请求已发送')
      await reload()
      return true
    } catch (e) {
      notify('发送失败：' + errMsg(e))
      return false
    }
  }

  async function respond(friendshipId: string, accept: boolean): Promise<void> {
    try {
      await FriendsAPI.friendRespond(friendshipId, accept)
      notify(accept ? '已成为好友 · 现在可以互相 @ 与邀请协作' : '已拒绝（不会通知对方）')
      await reload()
    } catch (e) {
      notify('操作失败：' + errMsg(e))
    }
  }

  async function remove(friendshipId: string, withdraw: boolean): Promise<void> {
    try {
      await FriendsAPI.friendRemove(friendshipId)
      notify(withdraw ? '已撤回好友请求' : '已解除好友')
      await reload()
    } catch (e) {
      notify('操作失败：' + errMsg(e))
    }
  }

  const friendCount = computed(() => accepted.value.length)

  return { myEmail, accepted, incoming, outgoing, isLoading, friendCount, reload, add, respond, remove }
}
