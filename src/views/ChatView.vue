<script setup lang="ts">
// 聊天视图（组装层）：左栏（工作区切换 + 搜索 + 今日胶囊 + 对话 + 收集箱）/ 主区（消息流 + 输入框）。
// 全部数据与编排走 useChat 门面；UI 拆为 Chat* 业务组件。行为与旧自包含 ChatView 完全一致。
import { useChat } from '@/modules/chat/composables/useChat'
import { usePane } from '@/shared/composables/usePane'
import { STORAGE_KEYS } from '@/shared/constants/storage-keys'
import { useToast } from '@/stores/toast'
import ChatTodayPill from '@/components/business/ChatTodayPill.vue'
import ChatSidebar from '@/components/business/ChatSidebar.vue'
import ChatFeedPanel from '@/components/business/ChatFeedPanel.vue'
import ChatMessageList from '@/components/business/ChatMessageList.vue'
import ChatComposer from '@/components/business/ChatComposer.vue'
import type { ChatProps } from '@/modules/chat/types'

const props = defineProps<ChatProps>()
const toast = useToast()
const { width: leftW, startResize } = usePane({ key: STORAGE_KEYS.PANE_CHAT, def: 304 })
const chat = useChat(props, (m) => toast.flash(m))
const {
  loading, canEdit, showList, modeLabel,
  feedQuery, feedList, feedCount, feedEmpty,
  todayCount, todayOpen, todayLoading, todayError, todaySubtitle, todayList,
  toggleTodayPanel, closeTodayPanel, refreshToday,
  conversationList, newConversation,
  messageList, thinking, thinkText,
  composer, mentionOpen, mentionItems, noMention, pendingRefs,
  showQuickPrompts, quickPrompts,
  send, atButton, removeRef, onComposerInput, sendKey, onCompStart, onCompEnd, runQuickPrompt,
} = chat
</script>

<template>
  <div class="relative flex h-full min-h-0">
    <div v-if="todayOpen" @click="closeTodayPanel" style="position:absolute;inset:0;z-index:13;"></div>
    <!-- 中栏：工作区 + 会话 + 收集箱 -->
    <div v-if="!isMobile || showList" class="flex flex-col border-r border-[var(--line)] bg-[var(--panel)]" :style="isMobile ? 'flex:1;width:100%;' : `width:${leftW}px;flex:0 0 ${leftW}px;`">
      <div class="flex flex-col gap-3 border-b border-[var(--line)] p-[15px_16px_13px]">
        <div class="flex items-center gap-2">
          <div class="inline-flex gap-0.5 rounded-[9px] bg-[var(--mid)] p-[3px]">
            <button @click="props.setWorkspace('work')" :style="`border:0;padding:6px 14px;border-radius:7px;cursor:pointer;font:${props.workspace==='work'?'600':'500'} 13px/1 var(--font);${props.workspace==='work'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">工作</button>
            <button @click="props.setWorkspace('personal')" :style="`border:0;padding:6px 14px;border-radius:7px;cursor:pointer;font:${props.workspace==='personal'?'600':'500'} 13px/1 var(--font);${props.workspace==='personal'?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">个人</button>
          </div>
          <div class="flex-1"></div>
          <button @click="props.togglePrivacy" title="隐私模式" :style="`border:0;width:32px;height:32px;border-radius:8px;cursor:pointer;background:${props.privacy?'var(--accent-bg)':'var(--mid)'};color:${props.privacy?'var(--accent-ink)':'var(--text2)'};display:flex;align-items:center;justify-content:center;`"><i class="ph ph-lock-simple"></i></button>
        </div>
        <div class="flex items-center gap-2 rounded-[9px] bg-[var(--mid)] px-[11px] py-2">
          <i class="ph ph-magnifying-glass text-[15px] text-[var(--text3)]"></i>
          <input v-model="feedQuery" placeholder="搜索收集内容" class="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[var(--text)]" />
        </div>
        <ChatTodayPill :count="todayCount" :open="todayOpen" :loading="todayLoading" :error="todayError" :subtitle="todaySubtitle" :items="todayList" @toggle="toggleTodayPanel" @close="closeTodayPanel" @refresh="refreshToday" />
      </div>
      <ChatSidebar :items="conversationList" @new="newConversation" />
      <ChatFeedPanel :items="feedList" :count="feedCount" :empty="feedEmpty" />
    </div>

    <div v-if="!isMobile" @mousedown="startResize" title="拖动调整宽度" class="flex-none cursor-col-resize" style="width:5px;position:relative;z-index:6;"><div style="position:absolute;inset:0 2px;background:var(--line);"></div></div>
    <!-- 主区：消息流 + composer -->
    <div v-if="!isMobile || !showList" class="flex flex-1 flex-col">
      <div v-if="isMobile" class="flex h-[44px] flex-none items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3"><button @click="showList = true" class="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] text-[var(--text2)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-list"></i></button><span class="text-sm font-semibold text-[var(--text)]">对话</span><div class="flex-1"></div><span class="text-[11px] font-medium text-[var(--text3)]">{{ modeLabel }}</span></div>
      <div v-if="!canEdit" class="flex flex-none items-center gap-2 border-b border-[var(--line)] bg-[var(--idea-bg)] px-[18px] py-2 text-[12px] font-semibold text-[var(--idea)]"><i class="ph ph-lock-simple"></i>只读模式 · 你当前是「只读」角色，无法创建或编辑内容</div>
      <ChatMessageList :messages="messageList" :loading="loading" :thinking="thinking" :think-text="thinkText" />
      <ChatComposer
        :text="composer" :mention-open="mentionOpen" :mention-items="mentionItems" :no-mention="noMention"
        :pending-refs="pendingRefs" :show-quick-prompts="showQuickPrompts" :quick-prompts="quickPrompts"
        :on-input="onComposerInput" :on-keydown="sendKey" :on-comp-start="onCompStart" :on-comp-end="onCompEnd"
        :on-send="send" :on-at="atButton" :on-remove-ref="removeRef" :on-quick-prompt="runQuickPrompt"
      />
    </div>
  </div>
</template>
