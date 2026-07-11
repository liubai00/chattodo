<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const modelValue = defineModel<string | number>()
</script>

<template>
  <input
    v-model="modelValue"
    :class="cn(
      'flex h-[34px] w-full rounded-[9px] border border-[var(--line2)] bg-[var(--panel)] px-3 py-1 text-sm shadow-none transition-[border-color,box-shadow] duration-200 ease-[var(--ease-neutral)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
      props.class,
    )"
  />
</template>
