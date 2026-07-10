<script setup lang="ts">
// 小节标签：统一 uppercase + tracking + text3 的小标题样式。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('mb-[9px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]', props.class)">
    <slot />
  </div>
</template>
