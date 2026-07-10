<script setup lang="ts">
// 自动规则项：由记忆生成的协作规则，可删。纯展示 + emit delete。
import type { AutoRule } from '@/types/api'
defineProps<{ rule: AutoRule }>()
defineEmits<{ delete: [] }>()
</script>

<template>
  <div class="flex items-center gap-[9px] border-b border-[var(--line)] py-2">
    <i class="ph ph-lightning text-[15px] text-[var(--idea)]"></i>
    <span class="flex-1 text-[13px] font-medium leading-snug text-[var(--text)]">新任务包含「{{ rule.keyword }}」-> 自动邀请 {{ rule.targetName }} 协作</span>
    <button @click="$emit('delete')" title="删除规则" class="cursor-pointer border-0 bg-transparent p-[3px] text-[15px] text-[var(--text3)]"><i class="ph ph-trash"></i></button>
  </div>
</template>
