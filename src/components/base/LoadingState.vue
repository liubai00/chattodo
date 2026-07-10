<script setup lang="ts">
// 通用加载占位。sizing 由 caller 经 class 传入（h-full 或 flex-1），与各视图原占位一致。
defineProps<{ text?: string }>()
</script>

<template>
  <div class="flex items-center justify-center text-[var(--text3)]">{{ text || '加载中…' }}</div>
</template>
