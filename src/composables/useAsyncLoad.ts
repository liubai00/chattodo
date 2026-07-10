import { onMounted } from 'vue'
import { useRequest, type UseRequestOptions, type UseRequestResult } from './useRequest'

/**
 * useRequest 的 onMounted 薄封装：挂载即拉取。视图首屏加载场景的标配。
 */
export function useAsyncLoad<T>(
  fn: () => Promise<T>,
  options: Omit<UseRequestOptions<T>, 'immediate'> = {},
): UseRequestResult<T> {
  const state = useRequest<T>(fn, { ...options, immediate: false })
  onMounted(state.execute)
  return state
}
