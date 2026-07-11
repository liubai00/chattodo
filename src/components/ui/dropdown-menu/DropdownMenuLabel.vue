<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DropdownMenuLabel, type DropdownMenuLabelProps } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<
  DropdownMenuLabelProps & { class?: HTMLAttributes['class']; inset?: boolean }
>()
</script>

<template>
  <DropdownMenuLabel
    :as-child="props.asChild"
    :as="props.as"
    :class="cn('px-2 py-1.5 text-sm font-semibold', props.inset && 'pl-8', props.class)"
  >
    <slot />
  </DropdownMenuLabel>
</template>
