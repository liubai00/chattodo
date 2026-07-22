// 任务域 API：任务 CRUD / 子任务 / 评论 / 协作邀请 / 项目 / 团队 / 规划。
// listTasks 的 query 拼装为本域私有 helper（toQuery）。
import { request } from '@/infrastructure/request'
import type { Task, Subtask, Comment, TaskDetail, Project, TeamUser, Invite } from '@/types/api'

function toQuery(params: Record<string, unknown>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&')
  return qs ? `?${qs}` : ''
}

export const TasksAPI = {
  listTasks: (params: Record<string, unknown> = {}) => request<Task[]>('GET', '/tasks' + toQuery(params)),
  createTask: (data: Partial<Task>) => request<Task>('POST', '/tasks', data),
  getTask: (id: string) => request<Task>('GET', `/tasks/${id}`),
  updateTask: (id: string, patch: Partial<Task>) => request<Task>('PATCH', `/tasks/${id}`, patch),
  taskDone: (id: string) => request<Task>('POST', `/tasks/${id}/done`),
  taskReopen: (id: string) => request<Task>('POST', `/tasks/${id}/reopen`),
  taskMoveOut: (id: string) => request<unknown>('POST', `/tasks/${id}/move-out`),
  deleteTask: (id: string, confirmed: boolean) => request<null>(
    'DELETE',
    `/tasks/${id}`,
    confirmed ? { confirmation: 'confirmed-by-linx' } : undefined,
  ),
  getTaskDetail: (id: string) => request<TaskDetail>('GET', `/tasks/${id}/detail`),
  addSubtask: (id: string, text: string) => request<Subtask>('POST', `/tasks/${id}/subtasks`, { text }),
  toggleSubtask: (id: string) => request<Subtask>('PATCH', `/subtasks/${id}`),
  addComment: (id: string, text: string, author: string) => request<Comment>('POST', `/tasks/${id}/comments`, { text, author }),

  inviteCollab: (taskId: string, userId: string, force?: boolean) => request<unknown>('POST', `/tasks/${taskId}/invite`, force ? { userId, force: true } : { userId }),
  myInvites: () => request<Invite[]>('GET', '/invites'),
  // mode: true/'accept' | false/'decline' | 'follow'（仅关注）
  respondInvite: (id: string, mode: boolean | 'accept' | 'decline' | 'follow', remind = true) => request<unknown>('POST', `/invites/${id}/respond`, mode === 'follow' ? { follow: true, remind } : { accept: mode === true || mode === 'accept', remind }),
  leaveTask: (taskId: string) => request<null>('POST', `/tasks/${taskId}/leave`),

  createProject: (name: string, description: string) => request<Project>('POST', '/projects', { name, description }),
  team: () => request<{ users: TeamUser[] }>('GET', '/team'),
  commitPlan: (items: unknown[]) => request<unknown>('POST', '/plan/commit', { items }),
  plan: (blockMinutes?: number) => request<{ items?: unknown[]; [k: string]: unknown }>('POST', '/plan', blockMinutes ? { blockMinutes } : {}),
}
