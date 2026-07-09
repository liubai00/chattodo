// 全局轻提示（toast）。旧 App.flashToast 与新视图共用本 store；
// 旧 App 模板里的 toast 元素读 store.msg，保证迁移期单一 toast UI（不出现两套提示）。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToast = defineStore('toast', () => {
  const msg = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  // 显示一条提示，2.6s 后自动清除；新提示覆盖旧的。
  function flash(m: string) {
    msg.value = m
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { msg.value = null }, 2600)
  }

  return { msg, flash }
})
