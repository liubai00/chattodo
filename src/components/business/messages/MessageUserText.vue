<script setup lang="ts">
// User text message bubble (also used for sys date separator — no v-message-enter for sys).
import { vMessageEnter } from '@/motion'
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <template v-if="m.isSys">
    <div class="self-center rounded-full bg-[var(--mid)] px-[13px] py-1.5 text-xs font-medium text-[var(--text3)]">{{ m.text }}</div>
  </template>
  <template v-else>
    <div v-message-enter class="flex flex-col items-end gap-[5px] self-end" style="max-width:78%;">
      <div v-if="m.hasRefs" class="flex flex-wrap justify-end gap-[5px]"><span v-for="(r, i) in m.refs" :key="i" class="inline-flex items-center gap-1 rounded-full bg-[var(--accent-bg)] px-[9px] py-[3px] text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-at text-[11px]"></i>{{ r }}</span></div>
      <div :title="m.time || ''" class="rounded-[15px_15px_5px_15px] bg-[var(--accent)] px-[14px] py-2.5 text-sm font-medium leading-relaxed text-[var(--accent-contrast)] shadow-md" style="white-space:pre-wrap;">{{ m.text }}</div>
      <span v-if="m.refId" @click="m.openRef" class="cursor-pointer px-1 text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-arrow-elbow-down-right text-[11px]"></i>已生成 · 查看</span>
    </div>
  </template>
</template>
