<script setup lang="ts">
// Plan message card in chat stream (suggested next-step plan with commit button).
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <div v-message-enter class="self-start rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] p-[15px] shadow-[var(--shadow-card)]" style="max-width:82%;">
    <div class="text-sm font-semibold text-[var(--text)]" style="font-family:var(--display);">{{ m.planTitle }}</div>
    <div class="mt-[3px] text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ m.planSub }}</div>
    <div class="mt-[13px] flex flex-col gap-[9px]"><div v-for="(p, i) in m.plan" :key="i" class="flex items-center gap-2.5"><span class="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[var(--accent-bg)] text-[11px] font-bold text-[var(--accent-ink)]">{{ p.n }}</span><span class="flex-1 text-[13.5px] font-medium leading-snug text-[var(--text)]">{{ p.t }}</span><span class="rounded-[var(--r-sm)] bg-[var(--mid)] px-2 py-[3px] text-[11px] font-semibold text-[var(--text2)]">{{ p.d }}</span></div></div>
    <div class="mt-[13px] flex items-center gap-1.5 border-t border-[var(--line)] pt-[11px] text-[11px] font-medium text-[var(--text3)]"><i class="ph ph-shield-check text-[13px] text-[var(--accent)]"></i>{{ m.planNote }}<span class="flex-1"></span><button v-if="!m.committed" @click="m.commitPlan" class="inline-flex items-center gap-[5px] rounded-lg bg-[var(--accent)] px-3 py-[7px] text-[11.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-play"></i>开始执行</button><span v-else class="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-check-circle"></i>已加入今日计划</span></div>
  </div>
</template>
