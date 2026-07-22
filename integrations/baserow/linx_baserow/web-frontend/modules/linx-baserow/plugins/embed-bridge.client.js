const SESSION_KEY = 'linx.baserow.session'

function applyTheme(theme) {
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('linx-theme-dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const parentOrigin = config.public.linxParentOrigin
  const embedded = window.self !== window.top

  if (!embedded) return

  document.documentElement.classList.add('linx-embedded')

  const receive = (event) => {
    if (event.origin !== parentOrigin || event.source !== window.parent) return
    const message = event.data || {}
    if (message.type === 'linx:theme') applyTheme(message.theme)
    if (message.type === 'linx:session-close') {
      window.sessionStorage.removeItem(SESSION_KEY)
      nuxtApp.$store.dispatch('auth/forceLogoff')
    }
    if (message.type === 'linx:open-row' && message.ref) {
      const ref = message.ref
      const target = JSON.parse(
        window.sessionStorage.getItem('linx.baserow.target') || '{}'
      )
      if (Number(ref.tableId) === Number(target.tableId)) {
        navigateTo({
          name: 'database-table-row',
          params: {
            databaseId: target.databaseId,
            tableId: target.tableId,
            viewId: target.viewId,
            rowId: ref.rowId,
          },
        })
      }
    }
  }

  window.addEventListener('message', receive)
  window.addEventListener('pagehide', () => {
    window.removeEventListener('message', receive)
  }, { once: true })
  window.parent.postMessage({ type: 'linx:baserow-ready' }, parentOrigin)
})
