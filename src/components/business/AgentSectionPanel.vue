<script setup lang="ts">
// Agent 分区面板：标题 + 描述 + textarea +（memory 分区）自动规则列表。
// 业务组件：不直接 fetch，经 emit update/deleteRule 上抛由视图调 useAgentConfig。
import ContentCard from '@/components/base/ContentCard.vue'
import SectionLabel from '@/components/base/SectionLabel.vue'
import AutoRuleItem from '@/components/business/AutoRuleItem.vue'
import type { AgentSectionDef } from '@/composables/useAgentConfig'
import type { AutoRule } from '@/types/api'

defineProps<{
  def: AgentSectionDef
  value: string
  autoRules?: AutoRule[]
  showRules?: boolean
}>()
const emit = defineEmits<{ update: [value: string]; deleteRule: [id: string] }>()
</script>

<template>
  <ContentCard>
    <div class="text-[15px] font-semibold text-[var(--text)]" style="font-family: var(--display)">{{ def.label }}</div>
    <div class="mt-1 text-[12.5px] font-medium leading-snug text-[var(--text3)]">{{ def.description }}</div>
    <textarea
      :value="value"
      @change="emit('update', ($event.target as HTMLTextAreaElement).value)"
      class="mt-[14px] block w-full min-h-[150px] resize-y rounded-[11px] border border-[var(--line2)] bg-[var(--bg)] px-[15px] py-[13px] text-sm font-medium leading-relaxed text-[var(--text)]"
      style="font-family: var(--font)"
    ></textarea>
    <template v-if="showRules && autoRules && autoRules.length">
      <div class="mt-[14px] border-t border-[var(--line)] pt-3">
        <SectionLabel>自动化规则（由记忆生成）</SectionLabel>
        <AutoRuleItem v-for="r in autoRules" :key="r.id" :rule="r" @delete="emit('deleteRule', r.id)" />
      </div>
    </template>
  </ContentCard>
</template>
