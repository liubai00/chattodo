const SESSION_KEY = 'linx.baserow.session'

function tellParent(type, detail = {}) {
  const config = useRuntimeConfig()
  window.parent.postMessage({ type, ...detail }, config.public.linxParentOrigin)
}

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const config = useRuntimeConfig()
  const isEmbedded = window.self !== window.top

  if (!isEmbedded) {
    window.location.replace(config.public.linxPublicUrl)
    return abortNavigation()
  }

  if (to.name === 'linx-session') return

  const hasSession = window.sessionStorage.getItem(SESSION_KEY) === '1'
  const isManagedTable = ['database-table', 'database-table-row'].includes(
    String(to.name || '')
  )
  if (!hasSession || !isManagedTable) {
    tellParent('linx:baserow-session-expired')
    return navigateTo({ name: 'linx-session', query: { expired: '1' } })
  }
})
