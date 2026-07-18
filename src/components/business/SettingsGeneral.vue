<script setup lang="ts">
// 设置 · 通用 section：主题/默认工作区/默认视图。状态经 SETTINGS_KEY 注入；seg 为分段按钮样式。
import { inject } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import FilterSelect from '@/components/base/FilterSelect.vue'

const { s, toggleTheme, updateSetting, viewOptions } = inject(SETTINGS_KEY)!
const seg = (on: boolean) => on
  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
  : 'text-[var(--text2)]'
</script>

<template>
  <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">外观主题</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">明亮 / 深色，保存到账号，下次登录生效</div></div>
      <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
        <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.theme === 'light')" @click="s.theme !== 'light' && toggleTheme()">明亮</button>
        <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.theme === 'dark')" @click="s.theme !== 'dark' && toggleTheme()">深色</button>
      </div>
    </div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认工作区</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">下次登录时进入的空间</div></div>
      <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
        <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.defaultWs === 'work')" @click="updateSetting('defaultWs', 'work')">工作</button>
        <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.defaultWs === 'personal')" @click="updateSetting('defaultWs', 'personal')">个人</button>
      </div>
    </div>
    <div class="flex items-center gap-[14px] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认视图</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">下次登录首屏进入的页面</div></div>
      <FilterSelect
        :model-value="s.defaultView"
        @update:model-value="(v) => updateSetting('defaultView', v)"
        :options="viewOptions"
        class="bg-[var(--bg)]"
      />
    </div>
  </div>
  <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">以上设置即时保存到你的账号。</div>
</template>
