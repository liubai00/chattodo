<script setup lang="ts">
// 设置 · 数据 section：导出全部数据 / 清空测试数据。状态经 SETTINGS_KEY 注入。
import { inject } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import Button from '@/components/ui/button/Button.vue'

const { doExport, doClearData } = inject(SETTINGS_KEY)!
</script>

<template>
  <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">导出全部数据</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">任务、待澄清、非 todo 与生成记录 (JSON)</div></div><Button variant="outline" size="sm" @click="doExport"><i class="ph ph-download-simple"></i>导出</Button></div>
    <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--danger)]">清空测试数据</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">删除当前账号下的全部测试数据，不可恢复</div></div><Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="doClearData">清空</Button></div>
  </div>
</template>
