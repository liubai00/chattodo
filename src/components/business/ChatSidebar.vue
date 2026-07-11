<script setup lang="ts">
// 对话列表小节：新建按钮 + 会话列表（含预览/时间/删除）。
// 列表项自带 open / remove 闭包（由 useChatConversations 绑定）；新建经 emit 上抛。
import type { ConversationItem } from '@/modules/chat/types'

defineProps<{ items: ConversationItem[] }>()
defineEmits<{ new: [] }>()
</script>

<template>
  <div class="flex items-center justify-between px-[17px] pb-[7px] pt-[11px]">
    <span class="text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--text3)]">对话</span>
    <button @click="$emit('new')" title="新建对话" class="inline-flex items-center gap-1 rounded-[8px] border border-[var(--line2)] bg-[var(--panel)] px-[10px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]" style="cursor:pointer;"><i class="ph ph-plus text-[13px]"></i>新建</button>
  </div>
  <div class="flex max-h-[38%] flex-col gap-0.5 overflow-auto px-[9px] pb-[6px] pt-0.5" style="flex:0 1 auto;">
    <a v-for="c in items" :key="c.id" @click="c.open" :style="`display:flex;gap:9px;padding:9px 10px;border-radius:10px;cursor:pointer;background:${c.active?'var(--accent-bg)':'transparent'};`" data-hv="0">
      <i class="ph ph-chat-teardrop-text" :style="`font-size:16px;margin-top:1px;flex:0 0 auto;color:${c.active?'var(--accent-ink)':'var(--text3)'};`"></i>
      <span class="min-w-0 flex-1"><span :style="`display:block;font:600 12.5px/1.3 var(--font);color:${c.active?'var(--accent-ink)':'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ c.title }}</span><span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium leading-tight text-[var(--text3)]">{{ c.preview }}</span></span>
      <span class="flex flex-col items-end gap-[3px]" style="flex:0 0 auto;"><span class="text-[10px] font-medium text-[var(--text3)]"><span class="lx-mono">{{ c.time }}</span></span><button @click.stop="c.remove" title="删除对话" class="px-px text-[12px] leading-none text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;">&times;</button></span>
    </a>
  </div>
</template>
