<script setup lang="ts" generic="T extends string">
// 分段控件：表格/看板 等 layout 切换。图标 + 文案，激活态实底+阴影。
// 泛型 T 收窄 modelValue（如 DbLayout = 'table' | 'board'），替代 inline :style 按钮组。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

interface SegmentItem<T extends string> { value: T; label: string; icon?: string }
const props = defineProps<{
  items: SegmentItem<T>[]
  modelValue: T
  class?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div :class="cn('inline-flex gap-0.5 rounded-[9px] bg-[var(--mid)] p-[3px]', props.class)">
    <button
      v-for="item in props.items"
      :key="item.value"
      type="button"
      @click="emit('update:modelValue', item.value)"
      :class="cn(
        'inline-flex cursor-pointer items-center gap-[5px] rounded-[7px] border-0 px-3 py-[6px] text-[12.5px] leading-none transition-colors duration-[160ms] outline-none',
        props.modelValue === item.value
          ? 'bg-[var(--panel)] font-semibold text-[var(--text)] shadow-[var(--shadow)]'
          : 'bg-transparent font-medium text-[var(--text2)] hover:text-[var(--text)]',
      )"
      style="font-family: var(--font)"
    >
      <i v-if="item.icon" :class="['ph', item.icon]"></i>{{ item.label }}
    </button>
  </div>
</template>
