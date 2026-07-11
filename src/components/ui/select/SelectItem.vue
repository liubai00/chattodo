<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  SelectItem,
  SelectItemIndicator,
  type SelectItemProps,
  SelectItemText,
} from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SelectItem
    :value="props.value"
    :disabled="props.disabled"
    :text-value="props.textValue"
    :as-child="props.asChild"
    :as="props.as"
    :class="cn(
      'lx-press relative flex w-full cursor-pointer select-none items-center rounded-[7px] py-1.5 pl-2.5 pr-8 text-[13px] outline-none transition-colors duration-[150ms] focus:bg-[var(--mid)] focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <span class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectItemIndicator>
        <i class="ph ph-check text-[14px]" />
      </SelectItemIndicator>
    </span>
    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
