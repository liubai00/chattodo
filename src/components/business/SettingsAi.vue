<script setup lang="ts">
// 设置 · AI 接入 section：非管理员（个人配置）/ 管理员（团队配置）两分支。状态经 SETTINGS_KEY 注入。
import { inject } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import { AI_PRESETS } from '@/modules/agent/constants'
import Button from '@/components/ui/button/Button.vue'
import ContentCard from '@/components/base/ContentCard.vue'
import FilterSelect from '@/components/base/FilterSelect.vue'
import Input from '@/components/ui/input/Input.vue'
import Switch from '@/components/ui/switch/Switch.vue'

const { canAdmin, s, apiKey, ownAiOpen, aiIsRule, aiPresetHint, aiOwnActive, aiPresetOptions, pickAiPreset, setAiField, testConn, saveSettings, saveOwnAi, clearOwnAi } = inject(SETTINGS_KEY)!
</script>

<template>
  <!-- 非管理员：个人配置 -->
  <template v-if="!canAdmin">
    <div class="flex items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
      <span class="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[var(--accent-bg)] text-[20px] text-[var(--accent-ink)]"><i :class="`ph ${aiOwnActive ? 'ph-user-gear' : 'ph-lock-simple'}`"></i></span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-[var(--text)]">{{ aiOwnActive ? '正在使用你的个人 AI 配置' : 'AI 接入由管理员统一配置' }}</div>
        <div class="mt-[3px] text-xs font-medium text-[var(--text3)] leading-snug">当前模型：{{ aiIsRule ? '规则版（离线）' : (s.aiModel || s.aiPreset) }}{{ aiOwnActive ? ' · 仅对你生效' : ' · 全团队共享' }}</div>
      </div>
      <Button variant="outline" size="sm" @click="ownAiOpen = !ownAiOpen">{{ ownAiOpen ? '收起' : '使用自己的 Key' }}</Button>
    </div>
    <ContentCard v-if="ownAiOpen" class="gap-[14px]">
      <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">服务商预设</span>
        <FilterSelect
          :model-value="s.aiPreset"
          @update:model-value="(v) => pickAiPreset(AI_PRESETS.find(p => p.name === v)!)"
          :options="aiPresetOptions"
          class="bg-[var(--bg)]"
        />
      </label>
      <template v-if="!aiIsRule">
        <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">Base URL</span><Input :model-value="s.aiBaseUrl" @update:model-value="(v) => setAiField('aiBaseUrl', v)" placeholder="https://api.deepseek.com/v1" /></label>
        <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">模型</span><Input :model-value="s.aiModel" @update:model-value="(v) => setAiField('aiModel', v)" placeholder="如 deepseek-chat / claude-sonnet-5" /></label>
        <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">API Key</span><Input v-model="apiKey" type="password" :placeholder="aiOwnActive ? '••••••（已配置，留空不修改）' : 'sk-...'" /></label>
      </template>
      <div class="flex items-center gap-2.5">
        <Button size="sm" @click="saveOwnAi">保存个人配置</Button>
        <Button v-if="aiOwnActive" variant="outline" size="sm" @click="clearOwnAi">恢复团队配置</Button>
        <span class="text-[11.5px] font-medium text-[var(--text3)] leading-snug">只影响你自己的 AI 调用 · Key 不回显</span>
      </div>
    </ContentCard>
  </template>

  <!-- 管理员：团队配置 -->
  <template v-else>
    <ContentCard class="gap-[14px]">
      <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">服务商预设</span>
        <FilterSelect
          :model-value="s.aiPreset"
          @update:model-value="(v) => pickAiPreset(AI_PRESETS.find(p => p.name === v)!)"
          :options="aiPresetOptions"
          class="bg-[var(--bg)]"
        />
        <span v-if="aiPresetHint" class="text-[11.5px] font-medium text-[var(--text3)]">{{ aiPresetHint }}</span>
      </label>
      <template v-if="!aiIsRule">
        <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">Base URL</span><Input :model-value="s.aiBaseUrl" @update:model-value="(v) => setAiField('aiBaseUrl', v)" placeholder="https://api.deepseek.com/v1（Claude 可留空用官方）" /></label>
        <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">模型</span><Input :model-value="s.aiModel" @update:model-value="(v) => setAiField('aiModel', v)" placeholder="如 deepseek-chat / qwen-plus / claude-sonnet-5" /></label>
        <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">API Key <span v-if="s.aiHasKey" class="font-medium text-[var(--text3)]">· 已配置（留空则不修改）</span></span><Input v-model="apiKey" type="password" :placeholder="s.aiHasKey ? '••••••（已配置）' : 'sk-...'" /></label>
        <div class="flex items-center gap-[14px] pt-0.5"><div class="flex-1"><div class="text-[13px] font-semibold text-[var(--text)]">失败兜底</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">模型调用失败时自动回退规则版，不丢输入</div></div><Switch :model-value="s.aiFallback !== false" @update:model-value="(v) => setAiField('aiFallback', v)" /></div>
      </template>
      <div v-else class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">规则版为离线关键词分类，无需 API Key。切换到其他服务商即可接入真实模型（支持任意 OpenAI 兼容服务）。</div>
    </ContentCard>
    <div class="flex items-center gap-[14px] rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-4 shadow-md">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">连接状态</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">用一条样例验证服务商 / 模型 / Key</div></div>
      <span v-if="s.aiTested" class="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>可用</span>
      <Button variant="outline" size="sm" @click="testConn">测试连接</Button>
    </div>
    <div class="flex items-center gap-3">
      <Button @click="saveSettings">保存配置</Button>
      <span class="text-xs font-medium text-[var(--text3)]">仅保存在你的账号下 · Key 不回显</span>
    </div>
  </template>
</template>
