<script setup lang="ts">
// Non-todo entity card in chat stream.
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <div v-message-enter class="flex flex-col gap-2 self-start" style="max-width:82%;">
    <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--nono-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--nono)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--nono)]"></span>非 todo<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
    <div class="rounded-[var(--r)] border border-dashed border-[var(--line2)] bg-[var(--nono-bg)] p-3">
      <div class="text-sm font-medium leading-relaxed text-[var(--text2)]">{{ m.text }}</div>
      <div class="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存<span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
    </div>
  </div>
</template>
