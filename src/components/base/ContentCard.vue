<script setup lang="ts">
// 通用内容卡片：基于 ui/Card，统一 Attio 面板圆角/边框/阴影/内边距。
// 覆盖 Card 默认的 gap/py/rounded/配色；保留 flex-col 骨架，内部间距由 caller 控制。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'
import Card from '@/components/ui/card/Card.vue'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <Card :class="cn('gap-0 rounded-[14px] border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-[var(--shadow-card)] text-[var(--text)]', props.class)">
    <slot />
  </Card>
</template>
