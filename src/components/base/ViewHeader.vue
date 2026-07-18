<script setup lang="ts">
// 通用 57px 视图头栏：图标 + 标题 + 副标题，可选返回按钮。
// 复用各视图顶部一致的头栏样式；副标题经默认 slot 传入（可含 lx-mono 计数等内联结构）。
defineProps<{
  /** Phosphor 图标类名后缀，如 "ph-sparkle"（传 "ph" 前缀以外的部分） */
  icon?: string
  title: string
  /** 图标颜色（CSS 值），默认 var(--accent-ink) */
  iconColor?: string
  /** 图标字号，默认 19px */
  iconSize?: string
  /** 是否显示返回按钮（移动端深选回退场景） */
  showBack?: boolean
}>()
defineEmits<{ back: [] }>()
</script>

<template>
  <div class="flex h-[57px] flex-none items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-[18px]">
    <button v-if="showBack" @click="$emit('back')" class="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text2)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-caret-left"></i></button>
    <slot name="leading" />
    <i v-if="icon" :class="['ph', icon]" :style="{ fontSize: iconSize || '19px', color: iconColor || 'var(--accent-ink)' }"></i>
    <slot name="icon" />
    <span class="text-[17px] font-semibold tracking-[var(--tracking-display)] text-[var(--text)]" style="font-family: var(--display)">{{ title }}</span>
    <span v-if="$slots.default" class="text-[12.5px] font-medium text-[var(--text3)]"><slot /></span>
    <template v-if="$slots.trailing"><div class="flex-1"></div><slot name="trailing" /></template>
  </div>
</template>
