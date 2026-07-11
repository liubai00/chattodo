<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TooltipContent, type TooltipContentProps, TooltipPortal } from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = withDefaults(
  defineProps<TooltipContentProps & { class?: HTMLAttributes['class'] }>(),
  { sideOffset: 6 },
)
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      :side="props.side"
      :side-offset="props.sideOffset"
      :align="props.align"
      :align-offset="props.alignOffset"
      :avoid-collisions="props.avoidCollisions"
      :class="cn(
        'lx-overlay z-50 overflow-hidden rounded-md px-2.5 py-1.5 text-xs font-medium shadow-md text-background bg-foreground',
        props.class,
      )"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
