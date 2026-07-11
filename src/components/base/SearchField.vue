<script setup lang="ts">
// 搜索输入框：左侧 Phosphor 放大镜 + 圆角灰底输入。Attio 风格。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  class?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div :class="cn('flex items-center gap-2 rounded-[9px] bg-[var(--mid)] px-[11px] py-[7px]', props.class)">
    <i class="ph ph-magnifying-glass text-[15px] text-[var(--text3)] shrink-0"></i>
    <input
      :value="props.modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      :placeholder="props.placeholder"
      class="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[var(--text)] outline-none placeholder:text-[var(--text3)]"
    />
  </div>
</template>
