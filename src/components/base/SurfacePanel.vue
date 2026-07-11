<script setup lang="ts">
// 面板容器：侧栏 / 工具栏统一背景与边框。side 控制边框朝向。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

const props = withDefaults(
  defineProps<{
    side?: 'left' | 'right' | 'none'
    class?: HTMLAttributes['class']
  }>(),
  { side: 'left' },
)
</script>

<template>
  <div
    :class="cn(
      'flex flex-col bg-[var(--panel)]',
      props.side === 'left' && 'border-r border-[var(--line)]',
      props.side === 'right' && 'border-l border-[var(--line)]',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
