<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectScrollDownButton, type SelectScrollDownButtonProps } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<SelectScrollDownButtonProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SelectScrollDownButton
    :as-child="props.asChild"
    :as="props.as"
    :class="cn('flex cursor-default items-center justify-center py-1', props.class)"
  >
    <i class="ph ph-caret-down text-[14px] opacity-60" />
  </SelectScrollDownButton>
</template>
