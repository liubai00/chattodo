<script setup lang="ts">
// Task entity card in chat stream.
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <div v-message-enter class="flex flex-col gap-2 self-start" style="max-width:82%;">
    <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--accent-ink)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>任务<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
    <div @click="m.open" class="cursor-pointer rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-[var(--shadow-card)]" data-hv="2">
      <div class="flex items-start gap-2.5"><span class="mt-px h-[18px] w-[18px] flex-none rounded-md border-2 border-[var(--accent)]"></span><div class="min-w-0 flex-1"><div class="text-[14.5px] font-semibold leading-relaxed text-[var(--text)]">{{ m.title }}</div><div class="mt-2.5 flex flex-wrap gap-1.5"><span v-for="(c, i) in m.chips" :key="i" class="inline-flex items-center gap-[5px] rounded-[var(--r-sm)] bg-[var(--mid)] px-[9px] py-1 text-[11.5px] font-semibold text-[var(--text2)]"><i :class="`ph ${c.i}`" style="font-size:12px;"></i>{{ c.t }}</span></div></div></div>
      <div class="mt-[11px] flex items-center gap-1.5 border-t border-[var(--line)] pt-[11px] text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-check-circle text-[14px] text-[var(--accent)]"></i>已进入 Todo 数据库 · 点击查看详情与来源<span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 px-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
    </div>
  </div>
</template>
