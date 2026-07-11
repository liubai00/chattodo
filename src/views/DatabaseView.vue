<script setup lang="ts">
// Todo 数据库视图（组装层）：dbViews 导航 | 头+筛选+批量+表格+看板。
// 全部数据/编排走 useDatabaseBoard（不改其逻辑）；表格拆为 DatabaseTable，看板列拆为 BoardColumn。
// P12：NavItem/SearchField/FilterSelect/SegmentedControl 替代原生控件与内联 :style 墙；视图切换走 Vue Transition。
import { useDatabaseBoard, DB_DEFS } from '@/modules/tasks/composables/useDatabaseBoard'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import NavItem from '@/components/base/NavItem.vue'
import SearchField from '@/components/base/SearchField.vue'
import FilterSelect from '@/components/base/FilterSelect.vue'
import SegmentedControl from '@/components/base/SegmentedControl.vue'
import SurfacePanel from '@/components/base/SurfacePanel.vue'
import IconButton from '@/components/base/IconButton.vue'
import DatabaseTable from '@/components/business/DatabaseTable.vue'
import BoardColumn from '@/components/business/BoardColumn.vue'
import type { DatabaseProps, DbLayout } from '@/modules/tasks/types'

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

const layoutItems: { value: DbLayout; label: string; icon: string }[] = [
  { value: 'table', label: '表格', icon: 'ph-rows' },
  { value: 'board', label: '看板', icon: 'ph-kanban' },
]
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- dbViews 导航列（桌面） -->
    <SurfacePanel
      v-if="!isMobile"
      :style="{ width: dbNavW + 'px', flex: '0 0 ' + dbNavW + 'px' }"
    >
      <div class="border-b border-[var(--line)] p-4 pb-3">
        <div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">Todo 数据库</div>
        <div class="mt-[3px] text-xs font-medium text-[var(--text3)]">全部任务与进度</div>
      </div>
      <div class="flex flex-1 flex-col gap-1 overflow-auto p-[10px]">
        <LoadingState v-if="loading" class="flex-1" />
        <NavItem
          v-for="d in DB_DEFS"
          v-else
          :key="d[0]"
          :icon="d[2]"
          :label="d[1]"
          :active="dbView === d[0]"
          :count="counts[d[0]]"
          @click="dbView = d[0]"
        />
      </div>
    </SurfacePanel>

    <div
      v-if="!isMobile"
      @mousedown="startResize"
      title="拖动调整宽度"
      class="relative z-[6] flex-none w-[5px] cursor-col-resize"
    >
      <div class="absolute inset-y-0 left-[2px] right-[2px] bg-[var(--line)]"></div>
    </div>

    <!-- 主区 -->
    <div class="flex flex-1 flex-col">
      <!-- 移动端 dbViews 横向 chips -->
      <div
        v-if="isMobile"
        class="flex flex-none items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--panel)] px-2 py-2"
      >
        <NavItem
          v-for="d in DB_DEFS"
          :key="d[0]"
          orientation="horizontal"
          :icon="d[2]"
          :label="d[1]"
          :active="dbView === d[0]"
          :count="counts[d[0]]"
          @click="dbView = d[0]"
        />
      </div>

      <!-- 57px 头 -->
      <ViewHeader icon="ph-table" :title="dbViewName">
        <span class="lx-mono">{{ filteredTasks.length }}</span> 条
        <template #trailing>
          <div class="flex items-center gap-2">
            <SegmentedControl v-model="dbLayout" :items="layoutItems" />
            <Button
              v-if="canEdit"
              @click="newCapture"
              class="h-8 gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold shadow-md"
            ><i class="ph ph-plus"></i>新建</Button>
          </div>
        </template>
      </ViewHeader>

      <!-- 筛选栏 -->
      <div
        :class="[
          'flex flex-none items-center gap-2.5 border-b border-[var(--line)] bg-[var(--panel)] px-[18px]',
          isMobile ? 'flex-wrap py-2' : 'h-[52px]',
        ]"
      >
        <SearchField
          v-model="dbSearch"
          placeholder="搜索任务标题"
          :class="isMobile ? 'w-full' : 'w-[230px]'"
        />
        <FilterSelect v-model="dbProject" :options="projectOptions" />
        <FilterSelect v-model="dbPriority" :options="priorityOptions" />
        <div class="flex-1"></div>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]">
          <i :class="['ph', modeIcon]" class="text-[13px]"></i>{{ modeLabel }}
        </span>
      </div>

      <!-- 批量栏 -->
      <Transition name="lx-batch">
        <div
          v-if="dbSelected.length > 0"
          class="flex h-12 flex-none items-center gap-[9px] border-b border-[var(--line)] bg-[var(--accent-bg)] px-[18px]"
        >
          <span class="text-[13px] font-semibold text-[var(--accent-ink)]">已选 {{ dbSelected.length }} 项</span>
          <div class="flex-1"></div>
          <Button variant="outline" size="sm" @click="batchStatus('done')"><i class="ph ph-check-circle text-[var(--accent)]"></i>标记完成</Button>
          <Button variant="outline" size="sm" @click="batchStatus('in_progress')">进行中</Button>
          <Button variant="outline" size="sm" @click="batchPriority(1)">设为 P1</Button>
          <Button variant="outline" size="sm" @click="batchMoveOut">移出 todo</Button>
          <Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="batchDelete">删除</Button>
          <IconButton icon="ph-x" label="取消选择" size="sm" @click="dbSelected = []" />
        </div>
      </Transition>

      <!-- 视图切换 table <-> board -->
      <Transition name="lx-view" mode="out-in">
        <DatabaseTable
          v-if="dbLayout === 'table'"
          key="table"
          :tasks="filteredTasks"
          :sort-key="dbSortKey"
          :sort-dir="dbSortDir"
          :all-selected="allSelected"
          :is-mobile="isMobile"
          :total-count="tasks.length"
          @sort="toggleSort"
          @select-all="selectAll"
        />
        <div
          v-else
          key="board"
          ref="boardEl"
          class="flex flex-1 items-stretch gap-4 overflow-auto p-[18px]"
        >
          <BoardColumn v-for="col in boardCols" :key="col.key" :col="col" :is-mobile="isMobile" />
        </div>
      </Transition>
    </div>
  </div>
</template>
