import { ref, type Ref } from 'vue'

export interface UseRequestOptions<T> {
  /** 立即执行一次（默认 false；首屏加载场景用 useAsyncLoad 或自行 onMounted） */
  immediate?: boolean
  /** 初始数据 */
  initialData?: T
  /** 错误回调（常用于 toast 提示） */
  onError?: (err: unknown) => void
}

export interface UseRequestResult<T> {
  data: Ref<T | null>
  isLoading: Ref<boolean>
  error: Ref<unknown>
  /** 执行请求；成功 resolve 结果，失败 resolve null（不 reject，错误已交 onError） */
  execute: () => Promise<T | null>
  /** 同 execute，语义上表示"刷新" */
  refresh: () => Promise<T | null>
}

/**
 * 通用异步请求封装：统一 data / isLoading / error 三态。
 * 纯副作用管理，不关心请求内容；视图层用它替代手写 try/catch + ref(true/false) 样板。
 */
export function useRequest<T>(fn: () => Promise<T>, options: UseRequestOptions<T> = {}): UseRequestResult<T> {
  const data = ref<T | null>(options.initialData ?? null) as Ref<T | null>
  const isLoading = ref(false)
  const error = ref<unknown>(null)

  async function execute(): Promise<T | null> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fn()
      data.value = res
      return res
    } catch (e) {
      error.value = e
      options.onError?.(e)
      return null
    } finally {
      isLoading.value = false
    }
  }

  if (options.immediate) void execute()

  return { data, isLoading, error, execute, refresh: execute }
}
