<script setup lang="ts">
// Error message card in chat stream (AI generation failure with retry button).
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <div v-message-enter class="flex flex-col gap-[9px] self-start rounded-[var(--r)] border-l-[3px] border-[var(--danger)] bg-[var(--danger-bg)] p-[13px_15px]" style="max-width:82%;">
    <div class="flex items-center gap-2 text-[13px] font-semibold text-[var(--danger)]"><i class="ph ph-warning-circle text-[16px]"></i>AI 生成失败 · {{ m.errType }}</div>
    <div class="text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">未静默失败 - 原始输入已保存，可重试，异常已记录到内部后台。</div>
    <div class="flex items-center gap-[9px]"><button @click="m.retry" class="inline-flex items-center gap-1.5 rounded-lg bg-[var(--danger)] px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-arrow-clockwise"></i>重试</button><span v-if="m.retrying" class="text-[11.5px] font-medium text-[var(--text3)]">重试中…</span></div>
  </div>
</template>
