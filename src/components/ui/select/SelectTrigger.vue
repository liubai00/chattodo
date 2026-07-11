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
      'flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 cursor-pointer',
      props.class,
    )"
  >
    <slot />
    <SelectIcon as-child>
      <i class="ph ph-caret-down text-[15px] opacity-50 shrink-0" />
    </SelectIcon>
  </SelectTrigger>
</template>
