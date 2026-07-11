<script setup lang="ts">
// 收集箱 feed 小节：标题 + 计数 + feed 列表（任务/待澄清/非 todo）+ 空态。
// 列表项自带 open 闭包（由 useChatFeed 绑定）；纯展示。
import type { FeedListItem } from '@/modules/chat/types'

defineProps<{ items: FeedListItem[]; count: number; empty: boolean }>()
</script>

<template>
  <div class="flex items-center justify-between border-t border-[var(--line)] px-[17px] pb-[7px] pt-[11px]">
    <span class="text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--text3)]">收集箱</span>
    <span class="text-[11px] font-semibold text-[var(--text3)]"><span class="lx-mono">{{ count }}</span></span>
  </div>
  <div class="flex flex-1 flex-col gap-px overflow-auto px-[9px] pb-3 pt-0.5">
    <a v-for="f in items" :key="f.id" @click="f.open" class="flex gap-2.5 rounded-[10px] bg-transparent p-2.5" style="cursor:pointer;" data-hv="0">
      <span :style="`width:7px;height:7px;border-radius:50%;background:${f.dot};margin-top:6px;flex:0 0 auto;`"></span>
      <span class="min-w-0 flex-1"><span :style="`display:block;font:600 13px/1.4 var(--font);color:${f.textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ f.title }}</span><span class="mt-0.5 block text-[11.5px] font-medium leading-tight text-[var(--text3)]">{{ f.label }} · <span class="lx-mono">{{ f.time }}</span></span></span>
    </a>
    <div v-if="empty" class="flex flex-col items-center gap-2 px-3 py-9 text-center text-[var(--text3)]"><i class="ph ph-tray text-[24px]"></i><div class="text-xs font-medium leading-relaxed">还没有收集内容<br/>在右侧输入框丢一句话试试</div></div>
  </div>
</template>
