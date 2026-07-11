<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DropdownMenuItem, type DropdownMenuItemProps } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<
  DropdownMenuItemProps & { class?: HTMLAttributes['class']; inset?: boolean }
>()
</script>

<template>
  <DropdownMenuItem
    :disabled="props.disabled"
    :text-value="props.textValue"
    :as-child="props.asChild"
    :as="props.as"
    :class="cn(
      'lx-press relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors duration-200 focus:bg-[var(--mid)] focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.inset && 'pl-8',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItem>
</template>
