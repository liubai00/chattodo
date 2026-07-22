import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  bootstrapBaserowControlSchema,
  createBaserowControlStore,
  requestSignature,
  type BaserowClient,
  type BaserowControlDb,
} from '@linx/infra-baserow'
import { NOTIFICATIONS_DDL } from '@linx/infra-notifications-pg'
import { buildApi } from '../src/facade/build-api.js'
import { RouteRegistry } from '../src/facade/route-registry.js'
import { makeBaserowPlugin } from '../src/routes/baserow.routes.js'

const now = new Date('2026-07-22T08:00:00.000Z')
const sharedSecret = 'test-secret-that-is-at-least-32-bytes-long'
const eventPath = '/api/internal/baserow/events'

let client: PGlite
let db: BaserowControlDb

beforeEach(async () => {
  client = new PGlite()
  await client.waitReady
  db = {
    async execute<R>(text: string, params?: readonly unknown[]) {
      const result = await client.query(text, params ? [...params] : undefined)
      return result.rows as R[]
    },
  }
  await client.exec('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT)')
  await client.exec("INSERT INTO users (id,name,email,role) VALUES ('uBob','Bob','b@x.io','member')")
  for (const statement of NOTIFICATIONS_DDL) await client.exec(statement)
  await bootstrapBaserowControlSchema(db)
})

afterEach(async () => {
  await client.close()
})

function signedHeaders(body: unknown, nonce: string, path = eventPath): Record<string, string> {
  const timestamp = String(Math.floor(now.getTime() / 1000))
  return {
    'x-linx-timestamp': timestamp,
    'x-linx-nonce': nonce,
    'x-linx-signature': requestSignature(sharedSecret, {
      method: 'POST',
      path,
      timestamp,
      nonce,
      body,
    }),
  }
}

describe('Baserow internal events', () => {
  it('persists assignment notifications once, publishes them live, and ignores removed users', async () => {
    const published: Array<{ userId: string; payload: unknown }> = []
    const app = await buildApi({
      registry: new RouteRegistry({ groups: { baserow: 'new' } }),
      auth: {
        resolveSession: async () => undefined,
        isOpenPath: (path) => path === eventPath,
      },
      migratedPlugins: [
        makeBaserowPlugin({
          db,
          control: createBaserowControlStore(db, { clock: () => now }),
          client: { health: async () => true } as unknown as BaserowClient,
          sharedSecret,
          publicUrl: 'http://tables.test',
          linxPublicUrl: 'http://linx.test',
          publish: (userId, payload) => published.push({ userId, payload }),
          clock: () => now,
        }),
      ],
    })
    const event = {
      type: 'task.assigned',
      eventId: 'event_12345678',
      recipients: ['uBob', 'uDeleted', 'uBob'],
      actorName: 'Alice',
      task: { ref: 'brw:team:12:34', title: '写首版集成方案' },
    }

    try {
      const first = await app.inject({
        method: 'POST',
        url: eventPath,
        headers: signedHeaders(event, 'a'.repeat(32)),
        payload: event,
      })
      expect(first.statusCode).toBe(200)
      expect(first.json()).toEqual({ ok: true, created: 1 })

      // Celery retries use a fresh HMAC nonce but retain the stable domain event id.
      const retry = await app.inject({
        method: 'POST',
        url: eventPath,
        headers: signedHeaders(event, 'b'.repeat(32)),
        payload: event,
      })
      expect(retry.statusCode).toBe(200)
      expect(retry.json()).toEqual({ ok: true, created: 0 })

      const notifications = await db.execute<Record<string, unknown>>('SELECT * FROM notifications')
      expect(notifications).toHaveLength(1)
      expect(notifications[0]).toMatchObject({
        user_id: 'uBob',
        type: 'assign',
        action_type: 'task',
        action_ref: 'brw:team:12:34',
        text: 'Alice 把「写首版集成方案」指派给你',
      })
      expect(published).toEqual([
        {
          userId: 'uBob',
          payload: {
            kind: 'notify',
            text: 'Alice 把「写首版集成方案」指派给你',
            actionType: 'task',
          },
        },
      ])

      const wrongPathSignature = await app.inject({
        method: 'POST',
        url: eventPath,
        headers: signedHeaders(event, 'c'.repeat(32), '/api/internal/baserow/exchange'),
        payload: event,
      })
      expect(wrongPathSignature.statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
})
