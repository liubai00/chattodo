<script setup lang="ts">
// Agent 配置：组件分层样板。数据/操作走 useAgentConfig；分区面板/规则项为 business 组件；
// 分区切换用 base/TabPills 替代旧 inline :style 按钮组。视图只组装。
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import PageBody from '@/components/base/PageBody.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import TabPills from '@/components/base/TabPills.vue'
import AgentSectionPanel from '@/components/business/AgentSectionPanel.vue'
import { useAgentConfig, AGENT_DEFS } from '@/composables/useAgentConfig'

defineProps<{ isMobile?: boolean }>()
const toast = useToast()
const { section, autoRules, isLoading, current, value, setValue, deleteRule } = useAgentConfig((m) => toast.flash(m))
function save() { toast.flash('Agent 配置已保存') }
</script>

<template>
  <div class="flex h-full flex-col">
    <ViewHeader icon="ph-sparkle" title="Agent 配置">{{ current.label }}</ViewHeader>
    <PageBody :is-mobile="isMobile">
      <LoadingState v-if="isLoading" class="h-full" />
      <div v-else class="mx-auto flex max-w-[680px] flex-col gap-4">
        <TabPills v-model="section" :items="AGENT_DEFS" />
        <AgentSectionPanel
          :def="current"
          :value="value"
          :auto-rules="autoRules"
          :show-rules="section === 'memory'"
          @update="setValue"
          @delete-rule="deleteRule"
        />
        <div class="flex items-center gap-3">
          <Button @click="save"><i class="ph ph-check"></i>保存</Button>
          <span class="text-xs font-medium leading-relaxed text-[var(--text3)]">修改后由 AI 在后续判断与追问中使用</span>
        </div>
      </div>
    </PageBody>
  </div>
</template>
