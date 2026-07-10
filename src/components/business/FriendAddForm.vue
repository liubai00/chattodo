<script setup lang="ts">
// 添加好友表单：邮箱输入 + 添加按钮（回车提交）。空值 emit('empty') 由视图提示。
// 暴露 clear() 供视图在添加成功后清空输入（保持与旧实现"成功才清空"的行为一致）。
import { ref } from 'vue'
import Button from '@/components/ui/button/Button.vue'

const email = ref('')
const emit = defineEmits<{ submit: [email: string]; empty: [] }>()

function onSubmit() {
  const v = (email.value || '').trim()
  if (!v) { emit('empty'); return }
  emit('submit', v)
}
function clear() { email.value = '' }
defineExpose({ clear })
</script>

<template>
  <div class="flex items-center gap-2">
    <input
      v-model="email"
      @keydown.enter.prevent="onSubmit"
      placeholder="对方注册邮箱（回车添加）"
      class="min-w-0 flex-1 rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]"
    />
    <Button @click="onSubmit">添加</Button>
  </div>
</template>
