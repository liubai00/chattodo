<script setup lang="ts">
// 图标按钮：统一 hover/active/focus 态。ghost(透明)/solid(紫)/subtle(灰底) 三变体。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'
import { useMotion } from '@/shared/composables/useMotion'

const mot = useMotion()

const props = withDefaults(
  defineProps<{
    icon: string
    label: string
    variant?: 'ghost' | 'solid' | 'subtle'
    size?: 'sm' | 'md' | 'lg'
    class?: HTMLAttributes['class']
  }>(),
  { variant: 'ghost', size: 'md' },
)
const emit = defineEmits<{ click: [] }>()

const sizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8 rounded-lg text-[16px]',
  md: 'h-[38px] w-[38px] rounded-[11px] text-[18px]',
  lg: 'h-10 w-10 rounded-xl text-[20px]',
}
const variantClass: Record<'ghost' | 'solid' | 'subtle', string> = {
  ghost: 'bg-transparent text-[var(--text2)] hover:bg-[var(--mid)] hover:text-[var(--text)]',
  solid: 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]',
  subtle: 'bg-[var(--mid)] text-[var(--text2)] hover:bg-[var(--surface-active)] hover:text-[var(--text)]',
}
</script>

<template>
  <button
    type="button"
    :title="props.label"
    :aria-label="props.label"
    @click="emit('click')"
    :class="cn(
      'lx-press inline-flex cursor-pointer items-center justify-center border-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
      mot.transitionColors,
      sizeClass[props.size],
      variantClass[props.variant],
      props.class,
    )"
  >
    <i :class="['ph', props.icon]"></i>
    <slot />
  </button>
</template>
