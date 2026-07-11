<script setup lang="ts">
// 项目视图（组装层）：项目列表+新建 | 选中项目任务列表。数据/操作走 useProjects。
import { useProjects, type ProjectsProps } from '@/modules/tasks/composables/useProjects'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import ContentCard from '@/components/base/ContentCard.vue'
import SectionLabel from '@/components/base/SectionLabel.vue'

const props = defineProps<ProjectsProps>()
const toast = useToast()
const { width: leftW, startResize } = usePane({ key: STORAGE_KEYS.PANE_PROJECTS, def: 280, max: 480 })
const {
  loading, canEdit, projList, selProject, selId, spTasks, spDone, spPct, modeLabel, modeIcon,
  newProjOpen, newProjName, selectProject, submitNewProject,
} = useProjects(props, (m) => toast.flash(m))
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- 列表列 -->
    <div v-if="!isMobile || !selId" class="flex flex-col border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : `width:${leftW}px;flex:0 0 ${leftW}px;`">
      <div class="flex items-center gap-2 border-b border-[var(--line)] p-4 pb-3">
        <div class="flex-1"><div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">项目</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">按项目组织任务与进度</div></div>
        <button v-if="canEdit" @click="newProjOpen = !newProjOpen" title="新建项目" class="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--accent-bg)] text-[16px] text-[var(--accent-ink)]" style="border:0;cursor:pointer;"><i class="ph ph-plus"></i></button>
      </div>
      <div v-if="newProjOpen" class="flex gap-[7px] border-b border-[var(--line)] p-[10px_12px]" style="animation: lx-fade .2s ease;">
        <input v-model="newProjName" @keydown.enter.prevent="submitNewProject" placeholder="项目名称（回车创建）" class="min-w-0 flex-1 rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
        <Button size="sm" @click="submitNewProject">创建</Button>
      </div>
      <div class="flex flex-1 flex-col gap-1 overflow-auto p-[10px]">
        <LoadingState v-if="loading" class="flex-1" />
        <template v-else>
          <a v-for="p in projList" :key="p.id" @click="selectProject(p.id)" :style="`display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:11px;cursor:pointer;background:${p.bg};`" data-hv="0">
            <div class="flex items-center gap-2">
              <span :style="`width:9px;height:9px;border-radius:3px;background:${p.color};flex:0 0 auto;`"></span>
              <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-[var(--text)]">{{ p.name }}</span>
              <span class="text-[11px] font-semibold text-[var(--text3)]">{{ p.done }}/{{ p.count }}</span>
            </div>
            <div class="h-[5px] overflow-hidden rounded-[3px] bg-[var(--mid)]"><div :style="`height:100%;width:${p.pct}%;background:${p.color};border-radius:3px;`"></div></div>
          </a>
          <div v-if="projList.length === 0" class="flex flex-col items-center gap-2 p-9 text-center text-[var(--text3)]">
            <i class="ph ph-folders text-[24px]"></i>
            <div class="text-xs font-medium leading-relaxed">还没有项目<br/>点右上角 + 创建后，聊天里提到项目名会自动归属</div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
    <!-- 详情列 -->
    <div v-if="!isMobile || !!selId" class="flex flex-1 flex-col">
      <ViewHeader :show-back="isMobile && !!selId" @back="selId = null" :title="selProject?.name || ''"><template #icon><span :style="`width:12px;height:12px;border-radius:4px;background:${selProject?.color || 'var(--accent)'};flex:0 0 auto;`"></span></template>{{ spDone }}/{{ spTasks.length }} 完成<template #trailing>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
      </template></ViewHeader>
      <div class="flex-1 overflow-auto p-[22px]">
        <div v-if="!loading && selProject" class="mx-auto flex max-w-[720px] flex-col gap-[18px]">
          <ContentCard>
            <div class="text-[13.5px] font-medium leading-relaxed text-[var(--text2)]">{{ selProject.desc || '（无描述）' }}</div>
            <div class="mt-[14px] flex items-center gap-3">
              <div class="h-2 flex-1 overflow-hidden rounded-[4px] bg-[var(--mid)]"><div :style="`height:100%;width:${spPct}%;background:${selProject.color};border-radius:4px;`"></div></div>
              <span class="text-[13px] font-semibold text-[var(--text)]">{{ spPct }}%</span>
            </div>
          </ContentCard>
          <SectionLabel class="mb-0">项目任务 · {{ spTasks.length }}</SectionLabel>
          <div v-stagger class="flex flex-col gap-2">
            <div v-for="t in spTasks" :key="t.title" @click="t.open" class="flex cursor-pointer items-center gap-[11px] rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-3 shadow-md" data-hv="2">
              <span :style="`width:8px;height:8px;border-radius:50%;background:${t.assigneeColor};flex:0 0 auto;`"></span>
              <div class="min-w-0 flex-1">
                <div :style="`font:600 13.5px/1.4 var(--font);color:${t.titleColor};${t.titleDeco}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ t.title }}</div>
                <div class="mt-[3px] text-[11px] font-medium text-[var(--text3)]">{{ t.statusLabel }} · <span class="lx-mono">{{ t.due }}</span></div>
              </div>
              <span :style="t.prioStyle">{{ t.prio }}</span>
              <span :style="`width:24px;height:24px;border-radius:50%;background:${t.assigneeColor};color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font:600 11px/1 var(--font);flex:0 0 auto;`">{{ t.assigneeInitial }}</span>
            </div>
          </div>
          <div v-if="spTasks.length === 0" class="flex flex-col items-center gap-2.5 pt-[60px] text-[var(--text3)]">
            <i class="ph ph-folders text-[30px]"></i>
            <div class="text-[13px] font-medium">这个项目还没有任务</div>
          </div>
        </div>
        <div v-else-if="!loading" class="flex flex-col items-center gap-2.5 pt-[90px] text-[var(--text3)]">
          <i class="ph ph-folders text-[30px]"></i>
          <div class="text-[13px] font-medium">选择左侧项目查看任务</div>
        </div>
      </div>
    </div>
  </div>
</template>
