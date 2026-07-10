<script setup lang="ts">
// 好友分组小节：SectionLabel + 列表(default slot) + 空态。
// alwaysShow=true 时空列表也展示空态（"我的好友"）；否则空列表整节隐藏（待处理/已发出）。
import SectionLabel from '@/components/base/SectionLabel.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import type { FriendItem } from '@/modules/friends/composables/useFriends'

defineProps<{
  label: string
  items: FriendItem[]
  count?: number
  countMono?: boolean
  emptyIcon?: string
  alwaysShow?: boolean
}>()
</script>

<template>
  <div v-if="items.length > 0 || alwaysShow">
    <SectionLabel>
      {{ label }}<template v-if="count !== undefined"> · <span v-if="countMono" class="lx-mono">{{ count }}</span><template v-else>{{ count }}</template></template>
    </SectionLabel>
    <slot v-if="items.length > 0" />
    <EmptyState v-else :icon="emptyIcon"><slot name="empty" /></EmptyState>
  </div>
</template>
