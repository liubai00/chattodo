// Chat message kind → renderer component mapping.
// Replaces the 7-way v-else-if chain in ChatMessageList.vue with <component :is>.
// P13 Phase 3: per-kind sub-components extracted to components/business/messages/.
import type { Component } from 'vue'
import MessageUserText from '@/components/business/messages/MessageUserText.vue'
import MessageAgentText from '@/components/business/messages/MessageAgentText.vue'
import MessageTask from '@/components/business/messages/MessageTask.vue'
import MessageIdea from '@/components/business/messages/MessageIdea.vue'
import MessageNono from '@/components/business/messages/MessageNono.vue'
import MessagePlan from '@/components/business/messages/MessagePlan.vue'
import MessageError from '@/components/business/messages/MessageError.vue'
import type { MessageItem } from '@/modules/chat/types'

export type MessageKind = 'sys' | 'user' | 'agentText' | 'task' | 'idea' | 'nono' | 'plan' | 'error'

export const MESSAGE_RENDERERS: Record<MessageKind, Component> = {
  sys: MessageUserText,        // sys messages use the same simple text display
  user: MessageUserText,
  agentText: MessageAgentText,
  task: MessageTask,
  idea: MessageIdea,
  nono: MessageNono,
  plan: MessagePlan,
  error: MessageError,
}

/** Resolve the renderer component for a message item based on its boolean flags. */
export function resolveRenderer(m: MessageItem): Component | null {
  if (m.isSys) return MESSAGE_RENDERERS.sys
  if (m.isUser) return MESSAGE_RENDERERS.user
  if (m.isAgentText) return MESSAGE_RENDERERS.agentText
  if (m.isTask) return MESSAGE_RENDERERS.task
  if (m.isIdea) return MESSAGE_RENDERERS.idea
  if (m.isNono) return MESSAGE_RENDERERS.nono
  if (m.isPlan) return MESSAGE_RENDERERS.plan
  if (m.isError) return MESSAGE_RENDERERS.error
  return null
}
