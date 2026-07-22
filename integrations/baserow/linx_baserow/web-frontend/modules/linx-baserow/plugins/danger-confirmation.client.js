const SESSION_KEY = 'linx.baserow.session'
const HEADER = 'X-LinX-Confirmed-Action'

function bodyObject(data) {
  if (data && typeof data === 'object') return data
  if (typeof data !== 'string') return {}
  try {
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function destructiveAction(config, store) {
  const method = String(config.method || 'get').toLowerCase()
  const path = String(config.url || '').split('?')[0]

  const fieldMatch = path.match(/\/database\/fields\/(\d+)\/?$/)
  if (fieldMatch && method === 'delete') {
    return {
      type: 'field.delete',
      message: '确认删除这个字段吗？该列中的数据会一并移入回收站。',
    }
  }
  if (fieldMatch && method === 'patch') {
    const nextType = bodyObject(config.data).type
    const field = store.getters['field/get']?.(Number(fieldMatch[1]))
    if (nextType && (!field || nextType !== field.type)) {
      return {
        type: 'field.type_change',
        message: '确认改变字段类型吗？无法转换的原有值可能会变为空。',
      }
    }
  }

  if (
    (method === 'delete' && /\/database\/rows\/table\/\d+\/\d+\/?$/.test(path)) ||
    (method === 'post' && /\/database\/rows\/table\/\d+\/batch-delete\/?$/.test(path))
  ) {
    return {
      type: 'row.delete',
      message: '确认删除所选任务吗？任务会移入受保护的回收记录。',
    }
  }

  return null
}

function silentCancellation() {
  const error = new Error('LinX destructive action cancelled')
  // Baserow components call handler.notifyIf in their catch blocks. A no-op
  // handler restores local loading state without displaying a false API error.
  error.handler = { notifyIf() {} }
  return error
}

export default defineNuxtPlugin((nuxtApp) => {
  if (window.self === window.top) return

  nuxtApp.$client.interceptors.request.use((config) => {
    if (window.sessionStorage.getItem(SESSION_KEY) !== '1') return config
    const action = destructiveAction(config, nuxtApp.$store)
    if (!action) return config
    if (!window.confirm(action.message)) {
      return Promise.reject(silentCancellation())
    }
    if (typeof config.headers?.set === 'function') {
      config.headers.set(HEADER, action.type)
    } else {
      config.headers = { ...(config.headers || {}), [HEADER]: action.type }
    }
    return config
  })
})
