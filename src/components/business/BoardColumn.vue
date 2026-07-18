<script setup lang="ts">
// 看板列：列头(状态色 + 名称 + 计数) + 卡片列表。drop/over/leave 经 BoardCol 闭包；
// 卡片用 TaskCard。hl(highlight) 为拖拽悬停高亮。纯展示。
import TaskCard from '@/components/business/TaskCard.vue'
import type { BoardCol } from '@/modules/tasks/types'

defineProps<{ col: BoardCol; isMobile?: boolean }>()
</script>

<template>
  <div :data-kanban-col="col.key" @drop="col.onDrop" @dragover="col.onOver" @dragleave="col.onLeave" :style="`${isMobile?'flex:0 0 240px;min-width:240px;':'flex:1;min-width:0;'}background:var(--panel);border:1px solid ${col.hl?'var(--accent)':'var(--line)'};border-radius:14px;display:flex;flex-direction:column;overflow:hidden;transition:border-color .12s;${col.hl?'box-shadow:0 0 0 2px var(--accent-bg);':''}`">
    <div class="flex items-center gap-2 border-b border-[var(--line)] p-[13px_14px]"><span :style="`width:8px;height:8px;border-radius:50%;background:${col.color};`"></span><span class="text-[13px] font-semibold text-[var(--text)]">{{ col.name }}</span><span class="lx-mono text-[11px] font-medium text-[var(--text-disabled)]">{{ col.count }}</span><span v-if="col.hl" class="ml-auto text-[10.5px] font-medium text-[var(--accent)]" style="animation:lx-pop .15s ease;">释放移入</span></div>
    <div v-stagger class="flex flex-1 flex-col gap-[9px] overflow-auto p-[10px]" style="min-height:120px;">
      <TaskCard v-for="c in col.cards" :key="c.id" :card="c" />
      <div v-if="col.hl" class="h-16 flex-none rounded-xl border-[1.5px] border-dashed" style="border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 4%,transparent);animation:lx-pop .15s ease;"></div>
    </div>
  </div>
</template>
