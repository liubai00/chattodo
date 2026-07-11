<script setup lang="ts">
// 消息流：加载态 + 消息渲染（经 message-registry <component :is>）+ thinking 指示。
// 纯展示：消息项自带 open / openRef / undo / commitPlan / retry 闭包（由 useChatMessages 绑定）。
// P13 Phase 3: 7 路 v-else-if 替换为 resolveRenderer + <component :is>；v-message-enter + streaming 跳过保留。
import type { MessageItem } from '@/modules/chat/types'
import { resolveRenderer } from '@/modules/chat/message-registry'

defineProps<{
  messages: MessageItem[]
  loading: boolean
  thinking: boolean
  thinkText: string
}>()
</script>

<template>
  <div id="lx-msgs" class="flex flex-1 flex-col gap-[17px] overflow-auto p-[26px]">
    <div v-if="loading" class="flex flex-1 items-center justify-center text-[var(--text3)]">加载中…</div>
    <template v-else>
      <component v-for="m in messages" :key="m.id" :is="resolveRenderer(m)" :m="m" />
      <div v-if="thinking" v-message-enter class="flex gap-[9px] self-start">
        <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--accent-contrast)] opacity-85" style="font-family:var(--display);margin-top:2px;">灵</span>
        <div class="inline-flex items-center gap-2 rounded-[5px_14px_14px_14px] bg-[var(--mid)] px-[14px] py-2.5"><span class="inline-flex gap-1" style="flex:0 0 auto;"><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite;"></span><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite .2s;"></span><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite .4s;"></span></span><span class="lx-think">{{ thinkText }}</span></div>
      </div>
    </template>
  </div>
</template>
