<script setup lang="ts">
// 复选框：表格行选 / 全选。替代 useDatabaseBoard 里的 selBoxStyle 内联字符串。
// 点击转发原生 Event，供父级 stopPropagation（行选不触发行 open）。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'
import { useMotion } from '@/shared/composables/useMotion'

const mot = useMotion()

const props = defineProps<{
  checked: boolean
  indeterminate?: boolean
  class?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ click: [e: Event] }>()
</script>

<template>
  <span
    role="checkbox"
    :aria-checked="props.indeterminate ? 'mixed' : props.checked"
    tabindex="0"
    @click="emit('click', $event)"
    @keydown.enter.prevent="emit('click', $event)"
    @keydown.space.prevent="emit('click', $event)"
    :class="cn(
      'flex h-[17px] w-[17px] flex-none cursor-pointer items-center justify-center rounded-[5px] outline-none',
      mot.transitionColors,
      props.checked || props.indeterminate
        ? 'border border-[var(--accent)] bg-[var(--accent)]'
        : 'border-[1.5px] border-[var(--line2)] bg-[var(--panel)] hover:border-[var(--accent)]',
      props.class,
    )"
  >
    <i v-if="props.indeterminate" class="ph ph-minus text-[11px] text-[var(--accent-contrast)]"></i>
    <i v-else-if="props.checked" class="ph ph-check text-[11px] text-[var(--accent-contrast)]"></i>
  </span>
</template>
