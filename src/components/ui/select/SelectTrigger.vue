<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectIcon, SelectTrigger, type SelectTriggerProps } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SelectTrigger
    :disabled="props.disabled"
    :as-child="props.asChild"
    :as="props.as"
    :class="cn(
      'lx-press flex h-[34px] w-full items-center justify-between gap-2 whitespace-nowrap rounded-[9px] border border-[var(--line2)] bg-transparent px-[10px] text-[12.5px] font-semibold shadow-none ring-offset-background transition-[color,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-neutral)] text-[var(--text2)] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 cursor-pointer',
      props.class,
    )"
  >
    <slot />
    <SelectIcon as-child>
      <i class="ph ph-caret-down text-[15px] opacity-50 shrink-0" />
    </SelectIcon>
  </SelectTrigger>
</template>
