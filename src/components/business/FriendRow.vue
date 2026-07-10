<script setup lang="ts">
// 好友行：incoming/outgoing/accepted 三态复用 base/ListRow，消除三段重复 markup。
// 头像/内容/操作按钮随 variant 切换；操作经 emit 上抛由视图调 useFriends。
import { computed } from 'vue'
import Button from '@/components/ui/button/Button.vue'
import ListRow from '@/components/base/ListRow.vue'
import { lxFmtDue } from '@/lib/format'
import type { FriendItem } from '@/modules/friends/composables/useFriends'

type FriendRowVariant = 'incoming' | 'outgoing' | 'accepted'
const props = defineProps<{ friend: FriendItem; variant: FriendRowVariant }>()
const emit = defineEmits<{
  accept: [friendshipId: string]
  reject: [friendshipId: string]
  withdraw: [friendshipId: string]
  remove: [friend: FriendItem]
}>()

const initial = computed(() => (props.friend.name || '?').slice(-1))
// incoming 实线+阴影；accepted 实线无阴影；outgoing 虚线
const rowVariant = computed<'solid' | 'dashed'>(() => (props.variant === 'outgoing' ? 'dashed' : 'solid'))
const rowClass = computed(() => (props.variant === 'incoming' ? 'mb-2 shadow-md' : 'mb-2'))
const avatarClass = computed(() =>
  props.variant === 'outgoing'
    ? 'flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--mid)] text-[12.5px] font-semibold text-[var(--text2)]'
    : 'flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[var(--surface-active)] text-[13px] font-semibold text-[var(--text-secondary)]',
)
const nameClass = computed(() =>
  props.variant === 'outgoing'
    ? 'block text-[13px] font-semibold leading-tight text-[var(--text)]'
    : 'block text-[13.5px] font-semibold leading-tight text-[var(--text)]',
)
</script>

<template>
  <ListRow :variant="rowVariant" :class="rowClass">
    <template #leading><span :class="avatarClass">{{ initial }}</span></template>
    <span :class="nameClass">{{ friend.name }}</span>
    <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">
      <template v-if="variant === 'accepted'">{{ friend.email }} · {{ lxFmtDue(friend.since) }}起</template>
      <template v-else>{{ friend.email }} · <span class="lx-mono">{{ lxFmtDue(friend.at) }}</span></template>
    </span>
    <template #trailing>
      <template v-if="variant === 'incoming'">
        <Button size="sm" @click="emit('accept', friend.friendshipId)">接受</Button>
        <Button variant="outline" size="sm" @click="emit('reject', friend.friendshipId)">拒绝</Button>
      </template>
      <Button v-else-if="variant === 'outgoing'" variant="outline" size="sm" @click="emit('withdraw', friend.friendshipId)">撤回</Button>
      <Button v-else variant="outline" size="sm" class="text-[var(--text3)]" @click="emit('remove', friend)">解除</Button>
    </template>
  </ListRow>
</template>
