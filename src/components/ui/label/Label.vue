<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils/cn'

const props = defineProps<{ for?: string; class?: HTMLAttributes['class'] }>()
</script>

<template>
  <label
    :for="props.for"
    :class="cn(
      'text-sm font-medium leading-none transition-colors duration-[var(--duration-standard)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70 peer-focus:text-[var(--accent)]',
      props.class,
    )"
  >
    <slot />
  </label>
</template>
