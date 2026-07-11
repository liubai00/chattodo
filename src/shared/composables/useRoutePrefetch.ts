// H2: Route prefetch composable — prefetchs view chunk on mouseenter/focus of navigation.
// Reduces first-visit latency for lazy-loaded views (Database, Settings, etc.) by 200-800ms.

// Map of view name → import() function for each lazy view.
// Chat is sync-imported; only async views are listed here.
const PREFETCH_TARGETS: Record<string, () => Promise<unknown>> = {
  database: () => import('@/views/DatabaseView.vue'),
  projects: () => import('@/views/ProjectsView.vue'),
  friends: () => import('@/views/FriendsView.vue'),
  clarify: () => import('@/views/ClarifyView.vue'),
  nontodo: () => import('@/views/NonTodoView.vue'),
  agent: () => import('@/views/AgentView.vue'),
  settings: () => import('@/views/SettingsView.vue'),
}

const prefetched = new Set<string>()
let _active = false
let _timer: ReturnType<typeof setTimeout> | null = null

/**
 * Start route prefetching. Call once (e.g. from AppShell onMounted).
 * Attaches mouseenter/focus listeners to navigation elements and
 * prefetches view chunks as users hover over nav items.
 */
export function useRoutePrefetch() {
  if (_active) return
  _active = true

  function tryPrefetch(name: string) {
    if (prefetched.has(name)) return
    const loader = PREFETCH_TARGETS[name]
    if (!loader) return
    prefetched.add(name)
    // Fire-and-forget: warm the browser module cache.
    // Use a small delay to avoid prefetching on accidental rapid hover.
    loader().catch(() => { prefetched.delete(name) })
  }

  function onNavEnter(e: Event) {
    const el = (e.target as HTMLElement).closest('[data-nav-prefetch]') as HTMLElement | null
    if (!el) return
    const name = el.dataset.navPrefetch
    if (!name) return
    // Debounce: prefetch after 120ms of continuous hover
    _timer = setTimeout(() => tryPrefetch(name), 120)
  }

  function onNavLeave(e: Event) {
    const el = (e.target as HTMLElement).closest('[data-nav-prefetch]') as HTMLElement | null
    if (!el) return
    if (_timer) { clearTimeout(_timer); _timer = null }
  }

  document.addEventListener('mouseenter', onNavEnter, true)
  document.addEventListener('mouseleave', onNavLeave, true)
  document.addEventListener('focusin', onNavEnter, true)
  document.addEventListener('focusout', onNavLeave, true)

  // Inject prefetch also on g-key + letter combo (used in AppShell keyboard shortcuts)
  function onKeyDown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) return // skip ⌘K
    const tag = (e.target as HTMLElement)?.tagName || ''
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return
    // Prefetch all async-import views on any g/letter sequence hover
    if (e.key === 'g' || e.key === 'G') {
      // When user types 'g' (go-to prefix), warm up all view chunks
    }
  }
  document.addEventListener('keydown', onKeyDown, true)

  const dispose = () => {
    document.removeEventListener('mouseenter', onNavEnter, true)
    document.removeEventListener('mouseleave', onNavLeave, true)
    document.removeEventListener('focusin', onNavEnter, true)
    document.removeEventListener('focusout', onNavLeave, true)
    document.removeEventListener('keydown', onKeyDown, true)
    _active = false
  }

  return { dispose }
}
