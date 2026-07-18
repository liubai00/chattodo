<script setup lang="ts">
// 设置 · 隐私与安全 section：AI 可见范围/默认隐私/好友策略。状态经 SETTINGS_KEY 注入；
// friendPolicy 切换的 toast 文案与旧 App 一致（沿用 useToast 单例）。
import { inject } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import { useToast } from '@/stores/toast'
import Switch from '@/components/ui/switch/Switch.vue'

const { s, updateSetting } = inject(SETTINGS_KEY)!
const toast = useToast()
const seg = (on: boolean) => on
  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
  : 'text-[var(--text2)]'
</script>

<template>
  <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">AI 可见范围</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">AI 制定计划时可读取的数据</div></div>
      <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
        <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.aiVisibility === 'visible_scope_only')" @click="updateSetting('aiVisibility', 'visible_scope_only')">仅可见范围</button>
        <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.aiVisibility === 'all_todo')" @click="updateSetting('aiVisibility', 'all_todo')">全部 todo</button>
      </div>
    </div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认开启隐私模式</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">登录后自动隐藏跨空间数据</div></div><Switch :model-value="s.privacyDefault" @update:model-value="(v) => updateSetting('privacyDefault', v)" /></div>
    <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">谢绝陌生人好友请求</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">开启后别人无法向你发起好友请求，只能由你主动添加对方</div></div><Switch :model-value="s.friendPolicy === 'closed'" @update:model-value="() => { updateSetting('friendPolicy', s.friendPolicy === 'closed' ? 'open' : 'closed'); toast.flash(s.friendPolicy === 'closed' ? '已开放接收好友请求' : '已谢绝陌生人好友请求 · 只能由你主动添加') }" /></div>
  </div>
  <div class="rounded-xl bg-[var(--mid)] p-3 text-[12.5px] font-medium text-[var(--text2)] leading-relaxed">隐私模式开启时，AI 只读取当前工作区（工作 / 个人）可见内容，非 todo 内容默认不参与计划。</div>
</template>
