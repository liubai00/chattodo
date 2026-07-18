<script setup lang="ts">
// 非 todo 隔离区视图（组装层）：列表 | 详情 master-detail。数据/操作走 useNonTodo。
import { useNonTodo, type NonTodoProps } from '@/modules/nontodo/composables/useNonTodo'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'

const props = defineProps<NonTodoProps>()
const toast = useToast()
const { width: leftW, startResize } = usePane({ key: STORAGE_KEYS.PANE_NONTODO, def: 280, max: 480 })
const { loading, visNons, selNon, selId, modeLabel, modeIcon, cnDest, select, nonConvert, removeNon, copyNon, exportNon } = useNonTodo(props, (m) => toast.flash(m))
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 57px 头栏 -->
    <ViewHeader :show-back="isMobile && !!selId" @back="selId = null" icon="ph-tray" icon-color="var(--nono)" title="非 todo 隔离区">不参与任务与计划<template #trailing>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-[var(--mid)] px-[11px] py-1.5 text-xs font-semibold text-[var(--text2)]"><i :class="`ph ${modeIcon}`" style="font-size:13px;"></i>{{ modeLabel }}</span>
    </template></ViewHeader>

    <div class="flex min-h-0 flex-1">
      <!-- 列表 -->
      <div v-if="!isMobile || !selId" class="flex flex-col overflow-auto border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : `width:${leftW}px;flex:0 0 ${leftW}px;`">
        <LoadingState v-if="loading" class="flex-1" />
        <template v-else>
          <a v-for="n in visNons" :key="n.id" @click="select(n.id)" :class="['flex cursor-pointer flex-col gap-1 p-[11px_12px]', n.id === selNon?.id ? 'bg-[var(--accent-bg)]' : '']" data-hv="0">
            <span class="text-[13.5px] font-semibold leading-snug text-[var(--text)]">{{ n.title }}</span>
            <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ n.text }}</span>
          </a>
          <div v-if="visNons.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-[var(--text3)]">
            <i class="ph ph-tray text-[24px]"></i>
            <div class="text-xs font-medium">暂无隔离项</div>
          </div>
        </template>
      </div>

      <!-- 详情 -->
      <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
      <div v-if="!isMobile || !!selId" class="flex-1 overflow-auto px-6 py-[30px]">
        <div v-if="!loading && selNon" class="mx-auto flex max-w-[640px] flex-col gap-[18px]" style="animation: lx-pop .2s ease;">
          <div class="text-[22px] font-semibold leading-relaxed text-[var(--text2)]" style="font-family: var(--display)">{{ selNon.title }}</div>
          <div class="rounded-xl border border-dashed border-[var(--line2)] bg-[var(--nono-bg)] p-[14px_16px]">
            <div class="text-sm font-medium leading-relaxed text-[var(--text2)]">{{ selNon.text }}</div>
            <div class="mt-[9px] flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存</div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-[13px_15px]">
            <div class="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text3)]"><i class="ph ph-quotes"></i>原始输入</div>
            <div class="mt-1.5 text-[13.5px] font-medium leading-relaxed text-[var(--text)]">{{ selNon.raw }}</div>
          </div>
          <div class="flex items-start gap-2 text-[12.5px] font-medium leading-relaxed text-[var(--text2)]"><i class="ph ph-sparkle mt-px text-[var(--accent-ink)]"></i><span>AI 判断为 <b class="text-[var(--nono)]">非 todo</b> · {{ selNon.reason }} · {{ cnDest }}</span></div>
          <div class="mt-0.5 flex flex-wrap items-center gap-2">
            <Button size="sm" @click="nonConvert(selNon.id)"><i class="ph ph-arrow-up-right"></i>转为 todo</Button>
            <Button variant="outline" size="sm" @click="copyNon">复制</Button>
            <Button variant="outline" size="sm" @click="exportNon">导出 Markdown</Button>
            <Button variant="outline" size="sm" @click="removeNon(selNon.id, '已归档')">归档</Button>
            <Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="removeNon(selNon.id, '已删除')">删除</Button>
          </div>
        </div>
        <div v-else-if="!loading" class="flex flex-col items-center justify-center gap-2.5 pt-[90px] text-[var(--text3)]">
          <i class="ph ph-tray text-[30px]"></i>
          <div class="text-[13px] font-medium">隔离区为空</div>
        </div>
      </div>
    </div>
  </div>
</template>
