// 实时事件的单一 SSE 归属（Pinia store）。
// 全局只此一处调用 ChatAPI.subscribeEvents 开 /api/events 连接；旧 App.vue 的 _startEvents
// 改为 connect()+subscribe() 委托本 store，避免迁移期双连接（双 toast / 双刷新）。
// P3 起各新视图直接订阅本 store，不再各自开 SSE；P4 旧 App 删除后本 store 仍是事件唯一入口。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ChatAPI, type ServerEvent } from '@/modules/chat/api'

export type EventStatus = 'idle' | 'connecting' | 'open'

type EventHandler = (e: ServerEvent) => void

export const useEventsStore = defineStore('events', () => {
  // 连接状态：connect() 置 connecting，首次收到事件置 open；idle 为未连接/已断开。
  // 注：subscribeEvents 内部对断线静默重连(5s)、错误不外抛，故无 'error' 态。
  const status = ref<EventStatus>('idle')
  const lastEvent = ref<ServerEvent | null>(null)
  // 事件序号：每收到一个事件自增。视图可 watch revision 触发节流刷新，不必深究 lastEvent 内容。
  const revision = ref(0)

  const handlers = new Set<EventHandler>()
  let stop: (() => void) | null = null

  // 开启 SSE；幂等（已连接则不重复开）。
  function connect() {
    if (stop) return
    status.value = 'connecting'
    stop = ChatAPI.subscribeEvents((e) => {
      status.value = 'open'
      lastEvent.value = e
      revision.value++
      // 单个订阅者抛错不影响其它订阅者与连接本身。
      handlers.forEach((h) => { try { h(e) } catch { /* ignore */ } })
    })
  }

  // 关闭 SSE；登出时调用。
  function disconnect() {
    if (stop) { try { stop() } catch { /* ignore */ }; stop = null }
    status.value = 'idle'
  }

  // 订阅事件流（与旧 api.subscribeEvents 回调等价）；返回取消订阅函数。
  function subscribe(h: EventHandler): () => void {
    handlers.add(h)
    return () => { handlers.delete(h) }
  }

  return { status, lastEvent, revision, connect, disconnect, subscribe }
})
