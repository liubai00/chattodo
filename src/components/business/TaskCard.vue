<script setup lang="ts">
// 看板任务卡片：data-kanban-card 供 GSAP Draggable 绑定；点击打开详情。
// data-flip-id 供 GSAP FLIP 跨列移动时按 id 匹配做位移动画。
// P14: 移除 draggable="true" + 原生 drag 事件，改由 useKanbanDraggable 绑定。
import type { FmtTask } from '@/modules/tasks/types'

defineProps<{ card: FmtTask }>()
</script>

<template>
  <div :data-kanban-card="card.id" :data-flip-id="'flip-task-' + card.id" @click="card.open" class="cursor-grab rounded-[11px] border border-[var(--line)] bg-[var(--bg)] p-[11px_12px] shadow-md" data-hv="2">
    <div :style="`font:600 13px/1.4 var(--font);color:${card.titleColor};${card.titleDeco}`">{{ card.title }}</div>
    <div class="mt-[9px] flex flex-wrap items-center gap-1.5"><span :style="card.prioStyle">{{ card.prio }}</span><span class="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text2)]"><i class="ph ph-folder text-[11px]"></i>{{ card.project }}</span><span :style="`font:500 11px/1 var(--font);color:${card.dueColor};`"><span class="lx-mono">{{ card.due }}</span></span><span :title="card.assignee" :style="`width:20px;height:20px;border-radius:50%;background:${card.assigneeColor};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);margin-left:auto;flex:0 0 auto;`">{{ card.assigneeInitial }}</span></div>
  </div>
</template>
