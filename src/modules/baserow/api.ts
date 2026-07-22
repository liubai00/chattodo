import { request } from '@/infrastructure/request'

export type TaskSpace = 'team' | 'personal'

export interface TaskRef {
  space: TaskSpace
  tableId: number
  rowId: number
}

export interface BaserowSession {
  launchUrl: string
  expiresAt: string
  space: TaskSpace
}

export interface BaserowStatus {
  enabled: boolean
  healthy: boolean
  publicUrl: string
}

export interface TeamInvitation {
  tokenHash: string
  createdBy: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
  usedBy: string | null
}

export interface CreatedTeamInvitation {
  url: string
  expiresAt: string
}

const REF_PATTERN = /^brw:(team|personal):(\d+):(\d+)$/

export function parseTaskRef(value: unknown): TaskRef | null {
  const match = REF_PATTERN.exec(String(value || ''))
  if (!match) return null
  const tableId = Number(match[2])
  const rowId = Number(match[3])
  if (!Number.isSafeInteger(tableId) || !Number.isSafeInteger(rowId)) return null
  return { space: match[1] as TaskSpace, tableId, rowId }
}

export const BaserowAPI = {
  status: () => request<BaserowStatus>('GET', '/baserow/status'),
  session: (space: TaskSpace) => request<BaserowSession>('POST', '/baserow/session', { space }),
  createInvitation: () => request<CreatedTeamInvitation>('POST', '/admin/baserow/invitations'),
  listInvitations: () => request<{ invitations: TeamInvitation[] }>('GET', '/admin/baserow/invitations'),
}
