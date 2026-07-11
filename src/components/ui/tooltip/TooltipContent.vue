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
        'z-50 overflow-hidden rounded-md px-2.5 py-1.5 text-xs font-medium shadow-md text-background bg-foreground animate-in fade-in-0 zoom-in-95 data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        props.class,
      )"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
