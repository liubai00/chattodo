<script setup lang="ts">
// AI agent text message bubble (with "灵" avatar and optional streaming cursor).
import type { MessageItem } from '@/modules/chat/types'
defineProps<{ m: MessageItem }>()
</script>

<template>
  <div v-message-enter="m.streaming" class="flex gap-[9px] self-start" style="max-width:82%;">
    <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);margin-top:2px;">灵</span>
    <div :title="m.time || ''" :style="`background:var(--panel);border:1px solid var(--line);padding:10px 14px;border-radius:5px 15px 15px 15px;font:500 14px/1.6 var(--font);color:${m.isErr?'var(--danger)':'var(--text)'};box-shadow:var(--shadow);white-space:pre-wrap;`">{{ m.text }}<span v-if="m.streaming" class="ml-px inline-block text-[var(--accent-ink)]" style="animation:lx-blink 1s steps(1) infinite;">▍</span></div>
  </div>
</template>
