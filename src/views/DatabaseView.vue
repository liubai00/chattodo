<script setup lang="ts">
// Todo 数据库视图（组装层）：dbViews 导航 | 头+筛选+批量+表格+看板。
// 全部数据/编排走 useDatabaseBoard；看板列拆为 BoardColumn + TaskCard。表格视图内联（行模型带闭包）。
import { useDatabaseBoard, DB_DEFS } from '@/modules/tasks/composables/useDatabaseBoard'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import BoardColumn from '@/components/business/BoardColumn.vue'
import type { DatabaseProps } from '@/modules/tasks/types'

const props = defineProps<DatabaseProps>()
const toast = useToast()
const { width: dbNavW, startResize } = usePane({ key: STORAGE_KEYS.PANE_DB, def: 200, min: 160, max: 360 })
const board = useDatabaseBoard(props, (m) => toast.flash(m))
const {
  loading, canEdit, tasks, modeLabel, modeIcon,
  dbView, dbLayout, dbSearch, dbProject, dbPriority, dbSortKey, dbSortDir, dbSelected,
  counts, dbViewName, filteredTasks, boardCols, projectOptions, priorityOptions,
  allSelected, boardEl,
  toggleSort, selectAll, batchStatus, batchPriority, batchMoveOut, batchDelete, newCapture,
} = board
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- dbViews 导航列 -->
    <div v-if="!isMobile" class="flex flex-col border-r border-[var(--line)] bg-[var(--panel)]" :style="`width:${dbNavW}px;flex:0 0 ${dbNavW}px;`">
      <div class="border-b border-[var(--line)] p-4 pb-3"><div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">Todo 数据库</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">全部任务与进度</div></div>
      <div class="flex flex-1 flex-col gap-1 overflow-auto p-[10px]">
        <LoadingState v-if="loading" class="flex-1" />
        <template v-else>
          <a v-for="d in DB_DEFS" :key="d[0]" @click="dbView = d[0]" :style="`display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;${dbView===d[0]?'font:600 13px/1 var(--font);color:var(--accent-ink);background:var(--accent-bg);':'font:500 13px/1 var(--font);color:var(--text2);background:transparent;'}`"><i :class="`ph ${d[2]}`" style="font-size:15px;"></i>{{ d[1] }}<span class="ml-auto text-[11px] font-semibold text-[var(--text3)]">{{ counts[d[0]] }}</span></a>
        </template>
      </div>
    </div>

    <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
    <!-- 主区 -->
    <div class="flex flex-1 flex-col">
      <!-- 移动端 dbViews 横向 chips -->
      <div v-if="isMobile" class="flex flex-none items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--panel)] px-2 py-2">
        <a v-for="d in DB_DEFS" :key="d[0]" @click="dbView = d[0]" :style="`display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;cursor:pointer;white-space:nowrap;${dbView===d[0]?'background:var(--accent-bg);color:var(--accent-ink);font:600 12px/1 var(--font);':'color:var(--text2);font:500 12px/1 var(--font);'}`"><i :class="`ph ${d[2]}`" style="font-size:13px;"></i>{{ d[1] }}<span class="text-[10px] font-semibold text-[var(--text3)]">{{ counts[d[0]] }}</span></a>
      </div>
      <!-- 57px 头 -->
      <ViewHeader icon="ph-table" :title="dbViewName"><span class="lx-mono">{{ filteredTasks.length }}</span> 条<template #trailing>
        <div class="inline-flex gap-0.5 rounded-[9px] bg-[var(--mid)] p-[3px]">
          <button @click="dbLayout = 'table'" :style="`border:0;padding:6px 12px;border-radius:7px;font:${dbLayout==='table'?'600':'500'} 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:5px;${dbLayout==='table'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`"><i class="ph ph-rows"></i>表格</button>
          <button @click="dbLayout = 'board'" :style="`border:0;padding:6px 12px;border-radius:7px;font:${dbLayout==='board'?'600':'500'} 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:5px;${dbLayout==='board'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`"><i class="ph ph-kanban"></i>看板</button>
        </div>
        <button v-if="canEdit" @click="newCapture" class="flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12.5px] font-semibold text-[var(--accent-contrast)] shadow-md" style="border:0;cursor:pointer;"><i class="ph ph-plus"></i>新建</button>
      </template></ViewHeader>
      <!-- 筛选栏 -->
      <div :class="['flex flex-none items-center gap-2.5 border-b border-[var(--line)] bg-[var(--panel)] px-[18px]', isMobile ? 'flex-wrap py-2' : 'h-[52px]']">
        <div class="flex items-center gap-2 rounded-[9px] bg-[var(--mid)] px-[11px] py-[7px]" :style="isMobile ? 'width:100%;' : 'width:230px;'">
          <i class="ph ph-magnifying-glass text-[15px] text-[var(--text3)]"></i>
          <input v-model="dbSearch" placeholder="搜索任务标题" class="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[var(--text)]" />
        </div>
        <select v-model="dbProject" class="cursor-pointer rounded-[9px] border border-[var(--line2)] bg-[var(--panel)] px-[10px] py-[7px] text-[12.5px] font-semibold text-[var(--text2)]">
          <option v-for="o in projectOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="dbPriority" class="cursor-pointer rounded-[9px] border border-[var(--line2)] bg-[var(--panel)] px-[10px] py-[7px] text-[12.5px] font-semibold text-[var(--text2)]">
          <option v-for="o in priorityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <div class="flex-1"></div>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
      </div>
      <!-- 批量栏 -->
      <div v-if="dbSelected.length > 0" class="flex h-12 flex-none items-center gap-[9px] border-b border-[var(--line)] bg-[var(--accent-bg)] px-[18px]" style="animation: lx-fade .2s ease;">
        <span class="text-[13px] font-semibold text-[var(--accent-ink)]">已选 {{ dbSelected.length }} 项</span>
        <div class="flex-1"></div>
        <Button variant="outline" size="sm" @click="batchStatus('done')"><i class="ph ph-check-circle text-[var(--accent)]"></i>标记完成</Button>
        <Button variant="outline" size="sm" @click="batchStatus('in_progress')">进行中</Button>
        <Button variant="outline" size="sm" @click="batchPriority(1)">设为 P1</Button>
        <Button variant="outline" size="sm" @click="batchMoveOut">移出 todo</Button>
        <Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="batchDelete">删除</Button>
        <button @click="dbSelected = []" title="取消选择" class="flex h-[30px] w-[30px] items-center justify-center text-[16px] text-[var(--text2)]" style="border:0;border-radius:8px;background:transparent;cursor:pointer;"><i class="ph ph-x"></i></button>
      </div>

      <!-- 表格视图 -->
      <template v-if="dbLayout === 'table'">
        <div class="flex-1 overflow-auto">
          <div class="grid border-b border-[var(--line)] bg-[var(--bg)]" style="grid-template-columns:36px 1fr 112px 100px 76px 88px 60px;gap:0;padding:0 22px;position:sticky;top:0;z-index:1;" :style="isMobile ? 'min-width:640px;' : ''">
            <div class="flex items-center py-3"><span @click="selectAll" :style="allSelected ? 'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--accent);border:1px solid var(--accent);' : 'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px solid var(--line2);background:var(--panel);'"><i class="ph ph-check" :style="`font-size:11px;color:var(--accent-contrast);${allSelected ? '' : 'display:none;'}`"></i></span></div>
            <div v-for="h in [{k:'title',l:'标题'},{k:'project',l:'项目'},{k:'due',l:'截止'},{k:'priority',l:'优先级'}]" :key="h.k" @click="toggleSort(h.k)" :style="`padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:${dbSortKey===h.k?'var(--text)':'var(--text3)'};text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;`">{{ h.l }}<i :class="`ph ${dbSortKey===h.k?(dbSortDir==='asc'?'ph-caret-up':'ph-caret-down'):'ph-arrows-down-up'}`" :style="`font-size:12px;color:${dbSortKey===h.k?'var(--accent-ink)':'var(--text3)'};`"></i></div>
            <div class="py-3 px-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text3)]">负责人</div>
            <div class="py-3 px-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text3)]">隐私</div>
          </div>
          <div v-for="t in filteredTasks" :key="t.id" :style="`display:grid;grid-template-columns:36px 1fr 112px 100px 76px 88px 60px;gap:0;padding:0 22px;border-bottom:1px solid var(--line);align-items:center;background:${t.rowBg};${isMobile?'min-width:640px;':''}`" data-hv="0">
            <div class="flex items-center py-[13px]"><span @click="t.toggleSel" :style="t.selBoxStyle"><i class="ph ph-check" :style="`font-size:11px;color:var(--accent-contrast);${t.selCheck}`"></i></span></div>
            <div @click="t.open" class="min-w-0 cursor-pointer py-[13px] px-2"><div :style="`font:600 13.5px/1.4 var(--font);color:${t.titleColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.titleDeco}`">{{ t.title }}</div><div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]">{{ t.statusLabel }}</div></div>
            <div @click="t.open" class="cursor-pointer py-[13px] px-2"><span class="inline-flex items-center gap-[5px] text-[12px] font-medium text-[var(--text2)]"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:.55;"></span>{{ t.project }}</span></div>
            <div @click="t.open" :style="`padding:13px 8px;font:500 12.5px/1 var(--font);color:${t.dueColor};cursor:pointer;`"><span class="lx-mono">{{ t.due }}</span></div>
            <div @click="t.open" class="cursor-pointer py-[13px] px-2"><span :style="t.prioStyle">{{ t.prio }}</span></div>
            <div @click="t.open" class="min-w-0 cursor-pointer py-[13px] px-2"><span class="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[var(--text2)]"><span :style="`width:20px;height:20px;border-radius:50%;background:${t.assigneeColor};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);flex:0 0 auto;`">{{ t.assigneeInitial }}</span><span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ t.assignee }}</span></span></div>
            <div @click="t.open" class="cursor-pointer py-[13px] px-2"><span class="inline-flex items-center gap-[5px] text-[11.5px] font-medium text-[var(--text3)]"><span :style="`width:7px;height:7px;border-radius:2px;background:${t.scopeColor};`"></span>{{ t.scopeLabel }}</span></div>
          </div>
          <div v-if="filteredTasks.length === 0" class="flex flex-col items-center gap-2.5 px-5 pt-[70px] text-[var(--text3)]"><i class="ph ph-stack text-[30px]"></i><div class="text-[13px] font-medium">{{ tasks.length === 0 ? '还没有任务 - 去聊天框丢一句「明天下午前完成XX」' : '没有匹配当前筛选的任务' }}</div></div>
          <div style="height:40px;"></div>
        </div>
      </template>

      <!-- 看板视图 -->
      <template v-if="dbLayout === 'board'">
        <div ref="boardEl" class="flex flex-1 items-stretch gap-4 overflow-auto p-[18px]">
          <BoardColumn v-for="col in boardCols" :key="col.key" :col="col" :is-mobile="isMobile" />
        </div>
      </template>
    </div>
  </div>
</template>
