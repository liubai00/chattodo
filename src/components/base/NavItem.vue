<script setup lang="ts">
// 导航项：Database 侧栏（vertical）与移动端 chips（horizontal）共用。
// active/hover 走 CSS class（非 inline :style）；count 计数右对齐。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

const props = withDefaults(
  defineProps<{
    icon?: string
    label: string
    active?: boolean
    count?: number
    orientation?: 'vertical' | 'horizontal'
    class?: HTMLAttributes['class']
  }>(),
  { orientation: 'vertical' },
)
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <a
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter.prevent="emit('click')"
    @keydown.space.prevent="emit('click')"
    :class="cn(
      'flex cursor-pointer items-center rounded-[9px] outline-none transition-colors duration-[160ms]',
      props.orientation === 'vertical'
        ? 'gap-[9px] px-[10px] py-[9px] text-[13px]'
        : 'flex-shrink-0 gap-[5px] whitespace-nowrap px-[10px] py-[6px] text-[12px]',
      props.active
        ? 'bg-[var(--accent-bg)] font-semibold text-[var(--accent-ink)]'
        : 'font-medium text-[var(--text2)] hover:bg-[var(--mid)] hover:text-[var(--text)]',
      props.class,
    )"
    style="font-family: var(--font)"
  >
    <i
      v-if="props.icon"
      :class="['ph', props.icon, props.orientation === 'vertical' ? 'text-[15px]' : 'text-[13px]']"
    ></i>
    <span class="min-w-0 truncate">{{ props.label }}</span>
    <span
      v-if="props.count !== undefined"
      :class="props.orientation === 'vertical' ? 'ml-auto text-[11px]' : 'text-[10px]'"
      class="font-semibold text-[var(--text3)]"
    >{{ props.count }}</span>
  </a>
</template>
