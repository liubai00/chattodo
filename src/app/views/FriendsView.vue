<script setup lang="ts">
// P3 第三个迁移视图：好友。自包含--挂载取 me+friends，本地 reactive 持有。
// friends 无 section 导航（中栏原是添加输入框），故本组件把输入框也并入主内容，
// 旧 App 中栏 friends 块移除、aside 对 friends 隐藏（main 撑满）。toast 经 useToast。
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/stores/toast'
import { lxFmtDue } from '@/lib/format'
import Button from '@/components/ui/button/Button.vue'

interface FriendItem { name: string; email: string; friendshipId: string; since?: string; at?: string }

const toast = useToast()
const loading = ref(true)
const myEmail = ref('')
const addFriendEmail = ref('')
const accepted = ref<FriendItem[]>([])
const incoming = ref<FriendItem[]>([])
const outgoing = ref<FriendItem[]>([])

const friendCount = computed(() => accepted.value.length)

async function load() {
  loading.value = true
  try {
    const [me, f] = await Promise.all([api.me(), api.friends()])
    myEmail.value = me.email || ''
    accepted.value = ((f as any).friends || []) as FriendItem[]
    incoming.value = ((f as any).incoming || []) as FriendItem[]
    outgoing.value = ((f as any).outgoing || []) as FriendItem[]
  } catch {
    toast.flash('加载好友列表失败，请刷新重试')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function submitAddFriend() {
  const email = (addFriendEmail.value || '').trim()
  if (!email) { toast.flash('请输入对方的注册邮箱'); return }
  api.friendRequest(email).then((r: any) => {
    addFriendEmail.value = ''
    toast.flash(r.autoAccepted ? '你们互相发过请求 · 已直接成为好友' : r.already ? '你们已经是好友了' : r.pending ? '请求已在等待对方处理' : '好友请求已发送')
    load()
  }).catch((e: any) => toast.flash('发送失败：' + e.message))
}
function respondFriend(friendshipId: string, accept: boolean) {
  api.friendRespond(friendshipId, accept).then(() => {
    toast.flash(accept ? '已成为好友 · 现在可以互相 @ 与邀请协作' : '已拒绝（不会通知对方）')
    load()
  }).catch((e: any) => toast.flash('操作失败：' + e.message))
}
function removeFriend(f: FriendItem) {
  if (!window.confirm('解除与「' + f.name + '」的好友关系？已有协作任务不受影响，但不能再互相邀请。')) return
  api.friendRemove(f.friendshipId).then(() => { toast.flash('已解除好友'); load() }).catch((e: any) => toast.flash('操作失败：' + e.message))
}
function withdrawFriend(f: FriendItem) {
  api.friendRemove(f.friendshipId).then(() => { toast.flash('已撤回好友请求'); load() }).catch((e: any) => toast.flash('操作失败：' + e.message))
}
function initial(name: string) { return (name || '?').slice(-1) }
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 57px 头栏 -->
    <div class="flex h-[57px] flex-none items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-[18px]">
      <i class="ph ph-users text-[20px] text-[var(--accent-ink)]"></i>
      <span class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">好友</span>
      <span class="text-[12.5px] font-medium text-[var(--text3)]">协作从好友开始</span>
    </div>

    <div class="flex-1 overflow-auto px-6 py-6">
      <div v-if="loading" class="flex h-full items-center justify-center text-[var(--text3)]">加载中…</div>
      <div v-else class="mx-auto flex max-w-[680px] flex-col gap-5">

        <!-- 添加好友（回车提交） -->
        <div class="flex items-center gap-2">
          <input
            v-model="addFriendEmail"
            @keydown.enter.prevent="submitAddFriend"
            placeholder="对方注册邮箱（回车添加）"
            class="min-w-0 flex-1 rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]"
          />
          <Button @click="submitAddFriend">添加</Button>
        </div>

        <!-- 待处理请求 -->
        <div v-if="incoming.length > 0">
          <div class="mb-[9px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">待处理请求 · {{ incoming.length }}</div>
          <div v-for="(f, i) in incoming" :key="'in' + i" class="mb-2 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-md">
            <span class="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[var(--surface-active)] text-[13px] font-semibold text-[var(--text-secondary)]">{{ initial(f.name) }}</span>
            <span class="min-w-0 flex-1"><span class="block text-[13.5px] font-semibold leading-tight text-[var(--text)]">{{ f.name }}</span><span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ f.email }} · <span class="lx-mono">{{ lxFmtDue(f.at) }}</span></span></span>
            <Button size="sm" @click="respondFriend(f.friendshipId, true)">接受</Button>
            <Button variant="outline" size="sm" @click="respondFriend(f.friendshipId, false)">拒绝</Button>
          </div>
        </div>

        <!-- 已发出 -->
        <div v-if="outgoing.length > 0">
          <div class="mb-[9px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">已发出 · 等待对方接受</div>
          <div v-for="(f, i) in outgoing" :key="'out' + i" class="mb-2 flex items-center gap-3 rounded-xl border border-dashed border-[var(--line2)] bg-[var(--panel)] p-[11px_14px]">
            <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--mid)] text-[12.5px] font-semibold text-[var(--text2)]">{{ initial(f.name) }}</span>
            <span class="min-w-0 flex-1"><span class="block text-[13px] font-semibold leading-tight text-[var(--text)]">{{ f.name }}</span><span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ f.email }} · <span class="lx-mono">{{ lxFmtDue(f.at) }}</span></span></span>
            <Button variant="outline" size="sm" @click="withdrawFriend(f)">撤回</Button>
          </div>
        </div>

        <!-- 我的好友 -->
        <div>
          <div class="mb-[9px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">我的好友 · <span class="lx-mono">{{ friendCount }}</span></div>
          <div v-for="(f, i) in accepted" :key="'ac' + i" class="mb-2 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <span class="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[var(--surface-active)] text-[13px] font-semibold text-[var(--text-secondary)]">{{ initial(f.name) }}</span>
            <span class="min-w-0 flex-1"><span class="block text-[13.5px] font-semibold leading-tight text-[var(--text)]">{{ f.name }}</span><span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ f.email }} · {{ lxFmtDue(f.since) }}起</span></span>
            <Button variant="outline" size="sm" class="text-[var(--text3)]" @click="removeFriend(f)">解除</Button>
          </div>
          <div v-if="accepted.length === 0" class="flex flex-col items-center gap-2.5 rounded-[14px] border border-dashed border-[var(--line2)] bg-[var(--panel)] p-10 text-center text-[var(--text3)]">
            <i class="ph ph-users text-[30px]"></i>
            <div class="text-[13px] font-medium leading-relaxed">还没有好友<br/>在上方输入对方的注册邮箱发送请求；也可以在聊天里说「加好友 对方邮箱」</div>
          </div>
        </div>

        <!-- 提示 -->
        <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium leading-relaxed text-[var(--text3)]">添加好友需要对方的注册邮箱（不提供按名字搜索，保护隐私）。成为好友后，双方可以互相 @提及、指派与邀请协作；解除好友不影响已有协作任务。不想被陌生人打扰？在 设置 · 隐私与安全 里可谢绝陌生请求。你的邮箱：{{ myEmail }}</div>

      </div>
    </div>
  </div>
</template>
