// In-memory sliding-window rate limiter (single-instance). For multi-instance,
// swap the Map for Redis INCR+EXPIRE (see events.js for the Redis pattern).
const buckets = new Map()

// Returns true if `key` has exceeded `max` hits within `windowMs` (this call counts).
export function isLimited(key, max, windowMs) {
  const now = Date.now()
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs)
  arr.push(now)
  buckets.set(key, arr)
  // opportunistic GC to bound memory
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      const alive = v.filter((t) => now - t < windowMs)
      if (alive.length) buckets.set(k, alive); else buckets.delete(k)
    }
  }
  return arr.length > max
}

// test helper
export function _reset() { buckets.clear() }
