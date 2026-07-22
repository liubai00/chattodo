import {
  type DynamicTaskRow,
  type TaskDatabaseActor,
  type TaskDatabasePort,
  type TaskDatabaseSchema,
  type TaskField,
  type TaskFieldKind,
  type TaskGridView,
  type TaskGridViewPatch,
  type TaskMutationSource,
  type TaskRef,
  type TaskSpace,
} from '@linx/domain-task-database'
import { canonicalJson, requestSignature, secureHex } from './signing.js'

export interface BaserowClientOptions {
  readonly internalUrl: string
  readonly sharedSecret: string
  readonly fetch?: typeof globalThis.fetch
  readonly clock?: () => Date
  readonly nonce?: () => string
}

interface ActionEnvelope<T> {
  readonly result: T
}

export class BaserowGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'BaserowGatewayError'
  }
}

export class BaserowClient implements TaskDatabasePort {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly clock: () => Date
  private readonly nonce: () => string
  private readonly actionPath = '/api/linx/v1/actions/'

  constructor(private readonly options: BaserowClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.clock = options.clock ?? (() => new Date())
    this.nonce = options.nonce ?? (() => secureHex(16))
  }

  async action<T>(actor: TaskDatabaseActor, action: Readonly<Record<string, unknown>>): Promise<T> {
    const body = { actor, action }
    const timestamp = String(Math.floor(this.clock().getTime() / 1000))
    const nonce = this.nonce()
    const signature = requestSignature(this.options.sharedSecret, {
      method: 'POST',
      path: this.actionPath,
      timestamp,
      nonce,
      body,
    })
    const response = await this.fetchImpl(new URL(this.actionPath, this.options.internalUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-linx-timestamp': timestamp,
        'x-linx-nonce': nonce,
        'x-linx-signature': signature,
      },
      body: canonicalJson(body),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      result?: T
      error?: string
      code?: string
    }
    if (!response.ok) {
      throw new BaserowGatewayError(payload.error || `Baserow gateway returned ${response.status}`, response.status, payload.code)
    }
    return (payload as ActionEnvelope<T>).result
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(new URL('/api/linx/v1/health/', this.options.internalUrl), {
        headers: { accept: 'application/json' },
      })
      return response.ok
    } catch {
      return false
    }
  }

  schema(actor: TaskDatabaseActor): Promise<TaskDatabaseSchema> {
    return this.action(actor, { type: 'schema.get' })
  }

  listRows(actor: TaskDatabaseActor, space: TaskSpace): Promise<readonly DynamicTaskRow[]> {
    return this.action(actor, { type: 'row.list', space })
  }

  async getRow(actor: TaskDatabaseActor, ref: TaskRef): Promise<DynamicTaskRow | undefined> {
    const row = await this.action<DynamicTaskRow | null>(actor, { type: 'row.get', ref })
    return row ?? undefined
  }

  createRow(
    actor: TaskDatabaseActor,
    space: TaskSpace,
    values: Readonly<Record<string, unknown>>,
    source: TaskMutationSource,
  ): Promise<DynamicTaskRow> {
    return this.action(actor, { type: 'row.create', space, values, source })
  }

  async updateRow(
    actor: TaskDatabaseActor,
    ref: TaskRef,
    values: Readonly<Record<string, unknown>>,
    source: TaskMutationSource,
  ): Promise<DynamicTaskRow | undefined> {
    const row = await this.action<DynamicTaskRow | null>(actor, { type: 'row.update', ref, values, source })
    return row ?? undefined
  }

  deleteRow(actor: TaskDatabaseActor, ref: TaskRef, confirmation: string): Promise<boolean> {
    return this.action(actor, { type: 'row.delete', ref, confirmation })
  }

  createField(
    actor: TaskDatabaseActor,
    space: TaskSpace,
    field: { name: string; type: TaskFieldKind; options?: Readonly<Record<string, unknown>> },
  ): Promise<TaskField> {
    return this.action(actor, { type: 'field.create', space, field })
  }

  updateField(
    actor: TaskDatabaseActor,
    space: TaskSpace,
    fieldId: number,
    patch: Readonly<Record<string, unknown>>,
    confirmation?: string,
  ): Promise<TaskField> {
    return this.action(actor, { type: 'field.update', space, fieldId, patch, confirmation })
  }

  deleteField(actor: TaskDatabaseActor, space: TaskSpace, fieldId: number, confirmation: string): Promise<boolean> {
    return this.action(actor, { type: 'field.delete', space, fieldId, confirmation })
  }

  getView(actor: TaskDatabaseActor, space: TaskSpace): Promise<TaskGridView> {
    return this.action(actor, { type: 'view.get', space })
  }

  updateView(actor: TaskDatabaseActor, space: TaskSpace, patch: TaskGridViewPatch): Promise<TaskGridView> {
    return this.action(actor, { type: 'view.update', space, patch })
  }
}
