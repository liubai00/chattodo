<script setup lang="ts">
// 视图主内容滚动区：flex-1 + overflow-auto + 响应式内边距。
// isMobile 决定窄/宽内边距；caller 可经 class 覆盖（如改 py）。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

const props = defineProps<{ isMobile?: boolean; class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('flex-1 overflow-auto', props.isMobile ? 'px-4 py-5' : 'px-6 py-[30px]', props.class)">
    <slot />
  </div>
</template>
