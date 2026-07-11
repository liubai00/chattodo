// Chat entity kind registry: unified task/idea/nono naming & behavior.
// Replaces 4 duplicate if-chains across useChatSend / useChatMessages / useChatFeed / AppShell.
// Follows AGENT_DEFS style (config table + pure functions, not interface classes).
import type { Router } from 'vue-router'
import { TasksAPI } from '@/modules/tasks/api'
import { ClarifyAPI } from '@/modules/clarify/api'
import { NonTodoAPI } from '@/modules/nontodo/api'

export type EntityKind = 'task' | 'idea' | 'nono'

// API entity type names as sent by the backend (todo_idea for idea, etc.)
export const ENTITY_API_TYPE: Record<EntityKind, string> = {
  task: 'task',
  idea: 'todo_idea',
  nono: 'nono',
}

// Reverse lookup: API type string → EntityKind
const API_TYPE_TO_KIND: Record<string, EntityKind> = {
  task: 'task', todo_idea: 'idea', nono: 'nono',
}

export function normalizeEntityKind(apiType: string): EntityKind {
  return API_TYPE_TO_KIND[apiType] || 'task'
}

// ---- per-entity behavior table ----
interface EntityEntry {
  kind: EntityKind
  apiType: string
  feedLabel: string
  feedDot: string
  /** Open entity detail from chat context */
  open: (ctx: EntityOpenCtx, id: string) => void
  /** Discard / delete the entity via API */
  discard: (id: string) => Promise<unknown>
  /** Search result navigation (AppShell executeSearch) */
  searchExecute: (router: Router, id: string) => void
}

// Minimal context needed for open() — callbacks from view props.
interface EntityOpenCtx {
  openTask: (id: string) => void
  openIdea: (id: string) => void
  openNon: (id: string) => void
}

// Message chip icons (for send entity->message)
interface EntityMsgMeta {
  kind: EntityKind
  chipIcon: string
  chipPrefix: string
}

const ENTITY_MSG_META: Record<EntityKind, EntityMsgMeta> = {
  task:  { kind: 'task',  chipIcon: 'ph-flag',           chipPrefix: 'P' },
  idea:  { kind: 'idea',  chipIcon: 'ph-lightbulb',       chipPrefix: '' },
  nono:  { kind: 'nono',  chipIcon: 'ph-tray',            chipPrefix: '' },
}

export const ENTITY_REGISTRY: Record<EntityKind, EntityEntry> = {
  task: {
    kind: 'task',
    apiType: 'task',
    feedLabel: '任务',
    feedDot: 'var(--accent)',
    open: (ctx, id) => ctx.openTask(id),
    discard: (id) => TasksAPI.deleteTask(id),
    searchExecute: (_router: Router, _id: string) => { /* openTask called via store, not router */ },
  },
  idea: {
    kind: 'idea',
    apiType: 'todo_idea',
    feedLabel: '待澄清',
    feedDot: 'var(--idea)',
    open: (ctx, id) => ctx.openIdea(id),
    discard: (id) => ClarifyAPI.ideaDiscard(id),
    searchExecute: (router, id) => router.push({ name: 'clarify', params: { selId: id } }),
  },
  nono: {
    kind: 'nono',
    apiType: 'nono',
    feedLabel: '非 todo',
    feedDot: 'var(--text3)',
    open: (ctx, id) => ctx.openNon(id),
    discard: (id) => NonTodoAPI.nonDiscard(id),
    searchExecute: (router, id) => router.push({ name: 'nontodo', params: { selId: id } }),
  },
}

// ---- convenience accessors used across composables ----

/** Feed display metadata: label + dot color. */
export function feedMeta(kind: EntityKind): { label: string; dot: string } {
  const e = ENTITY_REGISTRY[kind]
  return { label: e.feedLabel, dot: e.feedDot }
}

/** Discard entity by kind+id (undo flow in useChatMessages). */
export function discardEntity(kind: EntityKind, id: string): Promise<unknown> {
  return ENTITY_REGISTRY[kind].discard(id)
}

/** Open entity detail from chat context. */
export function openEntity(ctx: EntityOpenCtx, kind: EntityKind, id: string): void {
  ENTITY_REGISTRY[kind].open(ctx, id)
}

/** Search result → router navigation (AppShell executeSearch). */
export function executeEntitySearch(kind: EntityKind, router: Router, id: string): void {
  if (kind === 'task') return // handled by store openTask, not router
  ENTITY_REGISTRY[kind].searchExecute(router, id)
}

/** Message chip metadata for entity entity cards in chat stream. */
export function entityMsgMeta(kind: EntityKind): EntityMsgMeta {
  return ENTITY_MSG_META[kind]
}
