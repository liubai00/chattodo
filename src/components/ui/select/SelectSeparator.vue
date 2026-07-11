<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectSeparator } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SelectSeparator :class="cn('-mx-1 my-1 h-px bg-border', props.class)" />
</template>
