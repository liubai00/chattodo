// H4: Simple SWR cache for view data — avoids repeated full-screen loading spinners
// when returning to recently-visited views. Cache stores data + timestamp.
// Each view composable checks: if cache is fresh (< 30s), skip load.

interface CacheEntry<T> {
  data: T
  ts: number
}

const store = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL_MS = 30_000

export function useViewCache() {
  function get<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
    const entry = store.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() - entry.ts > ttlMs) {
      store.delete(key)
      return null
    }
    return entry.data
  }

  function set<T>(key: string, data: T): void {
    store.set(key, { data, ts: Date.now() })
  }

  function invalidate(key?: string): void {
    if (key) {
      store.delete(key)
    } else {
      store.clear()
    }
  }

  return { get, set, invalidate }
}
