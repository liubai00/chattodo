<script setup lang="ts">
// 设置视图（组装层）：section 标签栏 + 6 个 section 组件。状态全在 useSettings，经 SETTINGS_KEY 注入子组件。
import { provide } from 'vue'
import { useSettings, SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import PageBody from '@/components/base/PageBody.vue'
import SettingsAccount from '@/components/business/SettingsAccount.vue'
import SettingsGeneral from '@/components/business/SettingsGeneral.vue'
import SettingsAi from '@/components/business/SettingsAi.vue'
import SettingsNotifications from '@/components/business/SettingsNotifications.vue'
import SettingsPrivacy from '@/components/business/SettingsPrivacy.vue'
import SettingsData from '@/components/business/SettingsData.vue'

defineProps<{ isMobile?: boolean }>()
const settings = useSettings()
provide(SETTINGS_KEY, settings)
const { section, SET_SECTIONS, loading, setName } = settings
</script>

<template>
  <div class="flex h-full flex-col">
    <ViewHeader icon="ph-gear" title="设置">{{ setName }}</ViewHeader>

    <PageBody :is-mobile="isMobile">
      <LoadingState v-if="loading" class="h-full" />
      <div v-else class="mx-auto flex max-w-[600px] flex-col gap-4">
        <!-- section 标签栏（in-content，替代旧中栏导航） -->
        <div class="flex flex-wrap gap-1 rounded-[10px] bg-[var(--mid)] p-[3px]">
          <button v-for="s in SET_SECTIONS" :key="s[0]" @click="section = s[0]" :style="`border:0;padding:7px 13px;border-radius:7px;cursor:pointer;font:${section===s[0]?'600':'500'} 12.5px/1 var(--font);${section===s[0]?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">{{ s[1] }}</button>
        </div>

        <SettingsAccount v-if="section === 'account'" />
        <SettingsGeneral v-else-if="section === 'general'" />
        <SettingsAi v-else-if="section === 'ai'" />
        <SettingsNotifications v-else-if="section === 'notifications'" />
        <SettingsPrivacy v-else-if="section === 'privacy'" />
        <SettingsData v-else-if="section === 'data'" />
      </div>
    </PageBody>
  </div>
</template>
