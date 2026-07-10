// 非 todo 隔离域 API：转 todo / 丢弃。
import { request } from '@/infrastructure/request'

export const NonTodoAPI = {
  nonToTodo: (id: string) => request<unknown>('POST', `/non-todo-outputs/${id}/convert-to-todo`),
  nonDiscard: (id: string) => request<unknown>('POST', `/non-todo-outputs/${id}/discard`),
}
