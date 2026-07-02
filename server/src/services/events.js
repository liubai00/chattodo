// Realtime event bus.
// - Redis mode (REDIS_URL set): publishes go through Redis pub/sub so every app
//   instance receives them and delivers to its own local SSE sockets — safe to
//   scale horizontally.
// - Local mode (no REDIS_URL / connection failed): direct in-process delivery,
//   functionally identical on a single instance. Tests run in local mode.

const local = new Map() // userId → Set<ServerResponse>
const CHANNEL_PREFIX = 'linx:evt:'

let mode = 'local'
let pub = null

function frameOf(event) {
  return `event: ${event.kind || 'refresh'}\ndata: ${JSON.stringify(event)}\n\n`
}

function deliverLocal(userId, event) {
  const set = local.get(userId)
  if (!set || !set.size) return 0
  const frame = frameOf(event)
  let sent = 0
  for (const res of [...set]) {
    try { res.write(frame); sent++ } catch { set.delete(res) }
  }
  if (set && !set.size) local.delete(userId)
  return sent
}

// Boot-time init. Accepts an injected {publisher, subscriber} pair for tests;
// otherwise connects to redisUrl. Never throws — falls back to local mode.
export async function initEvents({ redisUrl, publisher, subscriber, logger } = {}) {
  const log = logger || console
  try {
    if (publisher && subscriber) {
      await subscriber.pSubscribe(CHANNEL_PREFIX + '*', (message, channel) => {
        try { deliverLocal(channel.slice(CHANNEL_PREFIX.length), JSON.parse(message)) } catch { /* bad frame */ }
      })
      pub = publisher
      mode = 'redis'
      return mode
    }
    if (!redisUrl) { mode = 'local'; return mode }
    const { createClient } = await import('redis')
    const client = createClient({ url: redisUrl })
    const sub = client.duplicate()
    client.on('error', (e) => log.error && log.error('events: redis publisher error: ' + e.message))
    sub.on('error', (e) => log.error && log.error('events: redis subscriber error: ' + e.message))
    await client.connect()
    await sub.connect()
    await sub.pSubscribe(CHANNEL_PREFIX + '*', (message, channel) => {
      try { deliverLocal(channel.slice(CHANNEL_PREFIX.length), JSON.parse(message)) } catch { /* bad frame */ }
    })
    pub = client
    mode = 'redis'
    log.info && log.info('events: redis mode (' + redisUrl.replace(/\/\/.*@/, '//***@') + ')')
    return mode
  } catch (err) {
    mode = 'local'
    pub = null
    log.error && log.error('events: redis unavailable, falling back to in-process bus: ' + err.message)
    return mode
  }
}

export function eventsMode() { return mode }

export function subscribe(userId, res) {
  if (!local.has(userId)) local.set(userId, new Set())
  local.get(userId).add(res)
  return () => {
    const set = local.get(userId)
    if (set) { set.delete(res); if (!set.size) local.delete(userId) }
  }
}

// Redis mode: fan out via pub/sub (our own subscription delivers to local sockets).
// Local mode: deliver directly. Return value = local deliveries (redis mode: async, returns 0 sync).
export function publish(userId, event) {
  if (mode === 'redis' && pub) {
    try { pub.publish(CHANNEL_PREFIX + userId, JSON.stringify(event)).catch(() => deliverLocal(userId, event)) } catch { return deliverLocal(userId, event) }
    return 0
  }
  return deliverLocal(userId, event)
}

export function publishMany(userIds, event) {
  let sent = 0
  for (const id of new Set(userIds)) sent += publish(id, event)
  return sent
}

// test/observability helper
export function connectionCount(userId) {
  return userId ? (local.get(userId)?.size || 0) : [...local.values()].reduce((n, s) => n + s.size, 0)
}
