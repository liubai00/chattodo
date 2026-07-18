<script setup lang="ts">
// Idea entity card (待澄清) in chat stream.
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <div v-message-enter class="flex flex-col gap-2 self-start" style="max-width:82%;">
    <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--idea-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--idea)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--idea)]"></span>待澄清<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
    <div class="rounded-[var(--r)] border border-l-[3px] border-[var(--idea)] border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-[var(--shadow-card)]">
      <div class="text-[14.5px] font-semibold leading-relaxed text-[var(--text)]">{{ m.title }}</div>
      <div class="mt-2 rounded-[10px] bg-[var(--idea-bg)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]"><b class="text-[var(--idea)]">建议下一步：</b>{{ m.suggest }}</div>
      <div class="mt-3 flex items-center gap-2"><button @click="m.open" class="cursor-pointer rounded-[var(--r-sm)] border border-[var(--accent)] bg-transparent px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)]">去澄清</button><span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
    </div>
  </div>
</template>
