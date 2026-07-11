<script setup lang="ts">
// 通用筛选下拉：封装 ui/Select，替代各处原生 <select>。
// options 为 {value,label}[]；v-model 收发 string（覆盖 Database/Settings 全部筛选场景）。
import type { HTMLAttributes } from 'vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/shared/utils/cn'

interface Option { value: string; label: string }
const props = defineProps<{
  options: Option[]
  modelValue: string
  placeholder?: string
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <Select
    :model-value="props.modelValue"
    :disabled="props.disabled"
    @update:model-value="(v) => emit('update:modelValue', v === undefined ? '' : String(v))"
  >
    <SelectTrigger
      :class="cn(
        'h-[34px] min-w-[110px] gap-2 rounded-[9px] border-[var(--line2)] bg-[var(--panel)] px-[10px] text-[12.5px] font-semibold text-[var(--text2)] shadow-none',
        props.class,
      )"
    >
      <SelectValue :placeholder="props.placeholder" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="o in props.options" :key="o.value" :value="o.value">
        {{ o.label }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
