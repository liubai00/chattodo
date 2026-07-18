<script setup lang="ts">
// 设置 · 通知 section：4 类通知开关。状态经 SETTINGS_KEY 注入。
import { inject } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import Switch from '@/components/ui/switch/Switch.vue'

const { s, toggleNotifPref } = inject(SETTINGS_KEY)!
</script>

<template>
  <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">任务指派</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">有人把任务指派给你</div></div><Switch :model-value="s.notifPrefs.assign" @update:model-value="() => toggleNotifPref('assign')" /></div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">到期提醒</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">任务临近截止时间</div></div><Switch :model-value="s.notifPrefs.due" @update:model-value="() => toggleNotifPref('due')" /></div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">AI 失败告警</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">AI 生成失败需要排查</div></div><Switch :model-value="s.notifPrefs.fail" @update:model-value="() => toggleNotifPref('fail')" /></div>
    <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">完成动态</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">团队成员完成任务</div></div><Switch :model-value="s.notifPrefs.done" @update:model-value="() => toggleNotifPref('done')" /></div>
  </div>
  <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">关闭后，对应类型的通知不再出现在左侧通知中心。</div>
</template>
