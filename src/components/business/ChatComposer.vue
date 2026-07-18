<script setup lang="ts">
// 输入区：@提及下拉 + 快捷提示 + 引用 chip + textarea + 发送。
// 纯展示 + 事件转发：所有状态/逻辑由 useChatSend 持有，经 props 注入；提及项自带 pick 闭包。
import Button from '@/components/ui/button/Button.vue'
import type { MentionItem, PendingRef } from '@/modules/chat/types'

defineProps<{
  text: string
  mentionOpen: boolean
  mentionItems: MentionItem[]
  noMention: boolean
  pendingRefs: PendingRef[]
  showQuickPrompts: boolean
  quickPrompts: { icon: string; label: string }[]
  onInput: (e: Event) => void
  onKeydown: (e: KeyboardEvent) => void
  onCompStart: () => void
  onCompEnd: () => void
  onSend: () => void
  onAt: () => void
  onRemoveRef: (id: string) => void
  onQuickPrompt: (label: string) => void
}>()
</script>

<template>
  <div class="relative border-t border-[var(--line)] bg-[var(--panel)] p-[14px_18px_18px]">
    <div v-if="mentionOpen" class="absolute bottom-[calc(100%-8px)] left-[18px] right-[18px] z-[6] max-h-[236px] overflow-y-auto overflow-hidden rounded-xl border border-[var(--line2)] bg-[var(--panel)] shadow-lg">
      <div class="px-[13px] pb-1.5 pt-[9px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--text3)]">提及 · 人 / 时间 / 文档</div>
      <template v-for="(mi, i) in mentionItems" :key="i"><div v-if="mi.groupHead" class="px-[13px] pb-1 pt-2 text-[10px] font-semibold tracking-[0.06em] text-[var(--text3)]">{{ mi.groupHead }}</div><a @click="mi.pick" :style="`display:flex;align-items:center;gap:10px;padding:9px 13px;cursor:pointer;background:${mi.bg};`" data-hv="0"><i :class="`ph ${mi.icon}`" class="text-[16px] text-[var(--accent-ink)]"></i><span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-[var(--text)]">{{ mi.label }}</span><span class="rounded-md bg-[var(--mid)] px-[7px] py-[3px] text-[10.5px] font-semibold text-[var(--text3)]">{{ mi.typeLabel }}</span></a></template>
      <div v-if="noMention" class="px-[13px] py-3 text-[12.5px] font-medium text-[var(--text3)]">没有匹配的人 / 时间 / 文档</div>
    </div>
    <div v-if="showQuickPrompts" class="mb-2.5 flex flex-wrap gap-[7px]" style="animation:lx-fade .3s ease;"><button v-for="(q, i) in quickPrompts" :key="i" @click="onQuickPrompt(q.label)" class="inline-flex items-center gap-1.5 rounded-full border border-[var(--line2)] bg-[var(--panel)] px-3 py-[7px] text-[12.5px] font-medium text-[var(--text2)]" style="cursor:pointer;" data-hv="2"><i :class="`ph ${q.icon}`" class="text-[13px] text-[var(--accent-ink)]"></i>{{ q.label }}</button></div>
    <div class="flex flex-col gap-[9px] rounded-[14px] border border-[var(--line2)] bg-[var(--panel)] p-[11px_12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div v-if="pendingRefs.length" class="flex flex-wrap gap-1.5"><span v-for="(r, i) in pendingRefs" :key="i" class="inline-flex items-center gap-1 rounded-full bg-[var(--accent-bg)] px-[5px] py-1 text-xs font-semibold text-[var(--accent-ink)]"><i class="ph ph-at text-xs"></i>{{ r.label }}<button @click="onRemoveRef(r.id)" class="flex items-center justify-center rounded-full px-0.5 text-xs text-[var(--accent-ink)]" style="border:0;background:transparent;cursor:pointer;">&times;</button></span></div>
      <textarea id="lx-composer" rows="1" :value="text" @input="onInput" @keydown="onKeydown" @compositionstart="onCompStart" @compositionend="onCompEnd" placeholder="输入想法、任务，或用 @ 提及人 / 时间 / 文档…（Shift+Enter 换行）" class="max-h-[120px] resize-none border-0 bg-transparent text-sm font-medium leading-relaxed text-[var(--text)]" style="overflow-y:auto;"></textarea>
      <div class="flex items-center gap-[9px]">
        <button @click="onAt" title="引用任务 / 项目" class="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[var(--mid)] text-[15px] text-[var(--text2)]" style="border:0;cursor:pointer;"><i class="ph ph-at"></i></button>
        <div class="flex-1"></div>
        <Button @click="onSend()"><i class="ph ph-paper-plane-tilt"></i>发送</Button>
      </div>
    </div>
  </div>
</template>
