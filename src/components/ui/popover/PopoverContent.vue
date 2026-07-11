<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  PopoverContent,
  type PopoverContentProps,
  PopoverPortal,
} from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes['class'] }>(),
  { sideOffset: 4 },
)
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      :side="props.side"
      :side-offset="props.sideOffset"
      :align="props.align"
      :align-offset="props.alignOffset"
      :avoid-collisions="props.avoidCollisions"
      :sticky="props.sticky"
      :hide-when-detached="props.hideWhenDetached"
      :class="cn(
        'lx-overlay z-50 w-72 rounded-[9px] border border-[var(--line2)] bg-[var(--elev)] p-4 text-popover-foreground shadow-md outline-none',
        props.class,
      )"
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
