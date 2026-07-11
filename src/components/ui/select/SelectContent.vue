<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  SelectContent,
  type SelectContentProps,
  SelectPortal,
  SelectViewport,
} from 'reka-ui'
import { cn } from '@/shared/utils/cn'

const props = withDefaults(
  defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(),
  { position: 'popper' },
)
</script>

<template>
  <SelectPortal>
    <SelectContent
      :position="props.position"
      :side="props.side"
      :side-offset="props.sideOffset"
      :align="props.align"
      :align-offset="props.alignOffset"
      :avoid-collisions="props.avoidCollisions"
      :sticky="props.sticky"
      :hide-when-detached="props.hideWhenDetached"
      :class="cn(
        'lx-overlay relative z-50 max-h-96 min-w-32 overflow-hidden rounded-[9px] border border-[var(--line2)] bg-[var(--elev)] text-popover-foreground shadow-md',
        props.position === 'popper'
          && 'min-w-[var(--reka-select-trigger-width)]',
        props.class,
      )"
      :style="props.position === 'popper' ? { transformOrigin: 'var(--reka-popper-transform-origin)' } : undefined"
    >
      <SelectViewport
        :class="cn(
          'p-1',
          props.position === 'popper' && 'w-full min-w-[var(--reka-select-trigger-width)]',
        )"
      >
        <slot />
      </SelectViewport>
    </SelectContent>
  </SelectPortal>
</template>
