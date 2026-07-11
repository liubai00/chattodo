<script setup lang="ts" generic="T extends string">
// 内容内标签栏（pill 切换）：v-model 控制激活项。替代各视图 inline :style 按钮组。
// 泛型 T 让 modelValue 可收窄为字符串字面量联合（如 AgentSection），避免 string 回灌丢类型。
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

interface TabItem<T extends string> { id: T; label: string }
const props = defineProps<{
  items: TabItem<T>[]
  modelValue: T
  class?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ 'update:modelValue': [id: T] }>()
</script>

<template>
  <div :class="cn('flex flex-wrap gap-1 rounded-[10px] bg-[var(--mid)] p-[3px]', props.class)">
    <button
      v-for="item in items"
      :key="item.id"
      @click="emit('update:modelValue', item.id)"
      :class="cn('cursor-pointer rounded-[7px] border-0 px-[13px] py-[7px] text-[12.5px] leading-none',
        props.modelValue === item.id
          ? 'bg-[var(--panel)] font-semibold text-[var(--text)] shadow-[var(--shadow)]'
          : 'bg-transparent font-medium text-[var(--text2)]')"
      style="font-family: var(--font)"
    >{{ item.label }}</button>
  </div>
</template>
