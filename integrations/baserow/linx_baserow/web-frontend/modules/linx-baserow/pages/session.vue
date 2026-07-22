<template>
  <main class="linx-session">
    <div class="linx-session__card" role="status" aria-live="polite">
      <div v-if="loading" class="linx-session__spinner" />
      <h1>{{ loading ? '正在打开 Todo 数据库…' : '无法打开 Todo 数据库' }}</h1>
      <p v-if="error">{{ error }}</p>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'

definePageMeta({ layout: false })

const SESSION_KEY = 'linx.baserow.session'
const route = useRoute()
const router = useRouter()
const nuxtApp = useNuxtApp()
const config = useRuntimeConfig()
const loading = ref(true)
const error = ref('')

function notifyParent(type, detail = {}) {
  window.parent.postMessage({ type, ...detail }, config.public.linxParentOrigin)
}

onMounted(async () => {
  if (window.self === window.top) {
    window.location.replace(config.public.linxPublicUrl)
    return
  }

  const ticket = String(route.query.ticket || '')
  if (!ticket) {
    loading.value = false
    error.value = route.query.expired
      ? '会话已过期，LinX 正在重新连接。'
      : '缺少一次性启动票据。'
    notifyParent('linx:baserow-session-expired')
    return
  }

  // Remove the one-time ticket before any authenticated API/navigation work so it
  // cannot be copied, retained in history, or sent as a referrer.
  window.history.replaceState({}, '', '/linx/session')

  try {
    const { data } = await nuxtApp.$client.post('/linx/v1/session/exchange/', {
      ticket,
    })
    const target = data.target
    await nuxtApp.$store.dispatch('auth/loginWithData', { data })
    window.sessionStorage.setItem(SESSION_KEY, '1')
    window.sessionStorage.setItem('linx.baserow.target', JSON.stringify(target))
    notifyParent('linx:baserow-authenticated', { target })
    await router.replace({
      name: 'database-table',
      params: {
        databaseId: target.databaseId,
        tableId: target.tableId,
        viewId: target.viewId,
      },
    })
  } catch (cause) {
    loading.value = false
    error.value =
      cause?.response?.data?.error || '一次性票据无效或已过期，请返回 LinX 重试。'
    notifyParent('linx:baserow-session-error', { message: error.value })
  }
})
</script>
