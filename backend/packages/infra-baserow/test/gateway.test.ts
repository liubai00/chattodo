import { describe, expect, it, vi } from 'vitest'
import type { TaskDatabaseActor, TaskDatabasePort } from '@linx/domain-task-database'
import { BaserowClient, canonicalJson, makeBaserowTaskRepo, requestSignature } from '../src/index.js'

const actor: TaskDatabaseActor = {
  id: 'u_1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'member',
}

describe('Baserow signed gateway', () => {
  it('canonicalizes object keys and signs every action with actor, timestamp, and nonce', async () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: '中' } })).toBe('{"a":{"x":"中","y":true},"z":1}')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(JSON.stringify({ result: { workspaceId: 1, databaseId: 2, tables: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new BaserowClient({
      internalUrl: 'http://baserow.internal',
      sharedSecret: 's'.repeat(64),
      fetch: fetchMock,
      clock: () => new Date('2026-07-22T00:00:00.000Z'),
      nonce: () => 'a'.repeat(32),
    })
    await client.schema(actor)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('http://baserow.internal/api/linx/v1/actions/')
    const body = { actor, action: { type: 'schema.get' } }
    expect(init?.body).toBe(canonicalJson(body))
    const timestamp = '1784678400'
    expect((init?.headers as Record<string, string>)['x-linx-signature']).toBe(
      requestSignature('s'.repeat(64), {
        method: 'POST',
        path: '/api/linx/v1/actions/',
        timestamp,
        nonce: 'a'.repeat(32),
        body,
      }),
    )
  })

  it('uses stable aliases when translating Baserow rows to legacy task ports', async () => {
    const database = {
      async listRows(_actor: TaskDatabaseActor, space: 'team' | 'personal') {
        return space === 'team'
          ? [{
              ref: { space: 'team' as const, tableId: 8, rowId: 3 },
              values: {
                '任务名称': '发布首版',
                '状态': { id: 2, value: '已完成' },
                '截止日期': '2026-07-31',
                '负责人': [{ first_name: 'Alice' }],
              },
              createdAt: '2026-07-20T00:00:00Z',
              updatedAt: '2026-07-21T00:00:00Z',
              access: 'owner' as const,
            }]
          : []
      },
    } as unknown as TaskDatabasePort
    const repo = makeBaserowTaskRepo({ database, actor })
    expect(await repo.all()).toEqual([
      expect.objectContaining({
        id: 'brw:team:8:3',
        title: '发布首版',
        status: 'done',
        dueAt: '2026-07-31',
        assignee: 'Alice',
      }),
    ])
  })
})
