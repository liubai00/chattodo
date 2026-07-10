<script setup lang="ts">
// 好友：组件分层样板。视图只组装--数据/操作走 useFriends，行/分组/表单各为 business 组件。
import { ref } from 'vue'
import { useToast } from '@/stores/toast'
import ViewHeader from '@/components/base/ViewHeader.vue'
import PageBody from '@/components/base/PageBody.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import FriendAddForm from '@/components/business/FriendAddForm.vue'
import FriendListSection from '@/components/business/FriendListSection.vue'
import FriendRow from '@/components/business/FriendRow.vue'
import { useFriends, type FriendItem } from '@/composables/useFriends'

defineProps<{ isMobile?: boolean }>()
const toast = useToast()
const {
  myEmail, accepted, incoming, outgoing, isLoading, friendCount,
  add, respond, remove,
} = useFriends((m) => toast.flash(m))

const addForm = ref<InstanceType<typeof FriendAddForm> | null>(null)
async function onAdd(email: string) { if (await add(email)) addForm.value?.clear() }
function onRemove(f: FriendItem) {
  if (!window.confirm('解除与「' + f.name + '」的好友关系？已有协作任务不受影响，但不能再互相邀请。')) return
  remove(f.friendshipId, false)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <ViewHeader icon="ph-users" icon-size="20px" title="好友">协作从好友开始</ViewHeader>
    <PageBody :is-mobile="isMobile" class="py-6">
      <LoadingState v-if="isLoading" class="h-full" />
      <div v-else class="mx-auto flex max-w-[680px] flex-col gap-5">
        <FriendAddForm ref="addForm" @submit="onAdd" @empty="toast.flash('请输入对方的注册邮箱')" />

        <FriendListSection label="待处理请求" :items="incoming" :count="incoming.length">
          <FriendRow v-for="(f, i) in incoming" :key="'in' + i" :friend="f" variant="incoming"
            @accept="(id) => respond(id, true)" @reject="(id) => respond(id, false)" />
        </FriendListSection>

        <FriendListSection label="已发出 · 等待对方接受" :items="outgoing">
          <FriendRow v-for="(f, i) in outgoing" :key="'out' + i" :friend="f" variant="outgoing"
            @withdraw="(id) => remove(id, true)" />
        </FriendListSection>

        <FriendListSection label="我的好友" :items="accepted" :count="friendCount" count-mono always-show empty-icon="ph-users">
          <template #empty>还没有好友<br/>在上方输入对方的注册邮箱发送请求；也可以在聊天里说「加好友 对方邮箱」</template>
          <FriendRow v-for="(f, i) in accepted" :key="'ac' + i" :friend="f" variant="accepted" @remove="onRemove" />
        </FriendListSection>

        <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium leading-relaxed text-[var(--text3)]">添加好友需要对方的注册邮箱（不提供按名字搜索，保护隐私）。成为好友后，双方可以互相 @提及、指派与邀请协作；解除好友不影响已有协作任务。不想被陌生人打扰？在 设置 · 隐私与安全 里可谢绝陌生请求。你的邮箱：{{ myEmail }}</div>
      </div>
    </PageBody>
  </div>
</template>
