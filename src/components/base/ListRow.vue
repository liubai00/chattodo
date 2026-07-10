<script setup lang="ts">
// 通用列表行：leading(头像/图标) + default(主内容，自动 flex-1) + trailing(操作)。
// variant=solid 实线带阴影（已接受/常用），variant=dashed 虚线（待处理/已发出）。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ variant?: 'solid' | 'dashed'; class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('flex items-center gap-3 rounded-xl bg-[var(--panel)]',
    props.variant === 'dashed'
      ? 'border border-dashed border-[var(--line2)] p-[11px_14px]'
      : 'border border-[var(--line)] p-3',
    props.class)">
    <slot name="leading" />
    <div v-if="$slots.default" class="min-w-0 flex-1"><slot /></div>
    <slot name="trailing" />
  </div>
</template>
