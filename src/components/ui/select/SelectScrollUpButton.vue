<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectScrollUpButton, type SelectScrollUpButtonProps } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<SelectScrollUpButtonProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SelectScrollUpButton
    :as-child="props.asChild"
    :as="props.as"
    :class="cn('flex cursor-default items-center justify-center py-1', props.class)"
  >
    <i class="ph ph-caret-up text-[14px] opacity-60" />
  </SelectScrollUpButton>
</template>
