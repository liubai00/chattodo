<script setup lang="ts">
// 通用空状态：图标 + 文案。caller 经默认 slot 传入文案（可含 <br/> 等结构）。
defineProps<{ icon?: string }>()
</script>

<template>
  <div class="flex flex-col items-center gap-2.5 rounded-[14px] border border-dashed border-[var(--line2)] bg-[var(--panel)] p-10 text-center text-[var(--text3)]">
    <i v-if="icon" :class="['ph', icon, 'text-[30px]']"></i>
    <div class="text-[13px] font-medium leading-relaxed"><slot /></div>
  </div>
</template>
