<script setup lang="ts">
// 数据库表格视图：表头（可排序）+ 行 + 空态。
// grid 走 scoped CSS（消除内联 grid-template 墙）；行模型 FmtTask 携 open/toggleSel 闭包，
// 表格级 sort / selectAll 经 emit 上抛。不动业务逻辑（筛选/排序/选择语义由 composable 决定）。
import Checkbox from '@/components/base/Checkbox.vue'
import type { FmtTask } from '@/modules/tasks/types'

const props = defineProps<{
  tasks: FmtTask[]
  sortKey: string
  sortDir: 'asc' | 'desc'
  allSelected: boolean
  isMobile?: boolean
  /** 未筛选任务总数（用于区分「无任务」与「无匹配」空态文案） */
  totalCount: number
}>()
const emit = defineEmits<{
  sort: [key: string]
  selectAll: [e: Event]
}>()

const headers = [
  { k: 'title', l: '标题' },
  { k: 'project', l: '项目' },
  { k: 'due', l: '截止' },
  { k: 'priority', l: '优先级' },
] as const
</script>

<template>
  <div class="flex-1 overflow-auto">
    <!-- 表头 -->
    <div
      class="db-grid sticky top-0 z-[1] border-b border-[var(--line)] bg-[var(--bg)]"
      :class="{ 'db-grid--mobile': props.isMobile }"
    >
      <div class="flex items-center py-3">
        <Checkbox :checked="props.allSelected" @click="emit('selectAll', $event)" />
      </div>
      <div
        v-for="h in headers"
        :key="h.k"
        @click="emit('sort', h.k)"
        class="db-head"
        :class="props.sortKey === h.k ? 'db-head--active' : 'db-head--idle'"
      >
        {{ h.l }}
        <i
          :class="['ph', props.sortKey === h.k ? (props.sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-arrows-down-up']"
          :style="{ color: props.sortKey === h.k ? 'var(--accent-ink)' : 'var(--text3)' }"
        ></i>
      </div>
      <div class="db-head db-head--static">负责人</div>
      <div class="db-head db-head--static">隐私</div>
    </div>

    <!-- 行 -->
    <div
      v-for="t in props.tasks"
      :key="t.id"
      class="db-grid db-row"
      :class="{ 'db-grid--mobile': props.isMobile, 'db-row--selected': t.selected }"
    >
      <div class="flex items-center py-[13px]">
        <Checkbox :checked="t.selected" @click="t.toggleSel" />
      </div>
      <div @click="t.open" class="db-cell cursor-pointer">
        <div
          class="truncate text-[13.5px] font-semibold leading-[1.4]"
          :class="{ 'line-through': !!t.titleDeco }"
          :style="{ color: t.titleColor }"
        >{{ t.title }}</div>
        <div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]">{{ t.statusLabel }}</div>
      </div>
      <div @click="t.open" class="db-cell cursor-pointer">
        <span class="inline-flex items-center gap-[5px] text-[12px] font-medium text-[var(--text2)]">
          <span class="db-dot"></span>{{ t.project }}
        </span>
      </div>
      <div @click="t.open" class="db-cell cursor-pointer">
        <span class="lx-mono text-[12.5px] font-medium" :style="{ color: t.dueColor }">{{ t.due }}</span>
      </div>
      <div @click="t.open" class="db-cell cursor-pointer">
        <span :style="t.prioStyle">{{ t.prio }}</span>
      </div>
      <div @click="t.open" class="db-cell cursor-pointer">
        <span class="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[var(--text2)]">
          <span class="db-avatar" :style="{ background: t.assigneeColor }">{{ t.assigneeInitial }}</span>
          <span class="truncate">{{ t.assignee }}</span>
        </span>
      </div>
      <div @click="t.open" class="db-cell cursor-pointer">
        <span class="inline-flex items-center gap-[5px] text-[11.5px] font-medium text-[var(--text3)]">
          <span class="db-dot-sq" :style="{ background: t.scopeColor }"></span>{{ t.scopeLabel }}
        </span>
      </div>
    </div>

    <!-- 空态 -->
    <div
      v-if="props.tasks.length === 0"
      class="flex flex-col items-center gap-2.5 px-5 pt-[70px] text-[var(--text3)]"
    >
      <i class="ph ph-stack text-[30px]"></i>
      <div class="text-[13px] font-medium">
        {{ props.totalCount === 0 ? '还没有任务 - 去聊天框丢一句「明天下午前完成XX」' : '没有匹配当前筛选的任务' }}
      </div>
    </div>
    <div style="height:40px;"></div>
  </div>
</template>

<style scoped>
.db-grid {
  display: grid;
  grid-template-columns: 36px 1fr 112px 100px 76px 88px 60px;
  align-items: center;
  gap: 0;
  padding: 0 22px;
}
.db-grid--mobile {
  min-width: 640px;
}
.db-row {
  border-bottom: 1px solid var(--line);
  transition: background-color var(--duration-base) var(--ease-in-out);
}
.db-row:hover {
  background: var(--mid);
}
.db-row--selected,
.db-row--selected:hover {
  background: var(--accent-bg);
}
.db-head {
  padding: 12px 8px;
  font: 700 11px/1 var(--font);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 5px;
}
.db-head--active {
  color: var(--text);
  cursor: pointer;
}
.db-head--idle {
  color: var(--text3);
  cursor: pointer;
}
.db-head--static {
  color: var(--text3);
  cursor: default;
}
.db-cell {
  min-width: 0;
  padding: 13px 8px;
}
.db-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.55;
  flex: 0 0 auto;
}
.db-dot-sq {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex: 0 0 auto;
}
.db-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--accent-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  font: 600 10px/1 var(--font);
  flex: 0 0 auto;
}
</style>
