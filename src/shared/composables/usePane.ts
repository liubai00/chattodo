import { ref } from 'vue'

// 通用分栏：左列可拖拽调宽，桌面端用。每视图独立 localStorage 持久化。
// 移动端不走这里（各视图已有 master-detail / 单列方案）。
// 对齐 legacy startMidResize（拖拽改 midW + localStorage lx_mid_w）；resize-only，无 swap。
export function usePane(opts: { key: string; def: number; min?: number; max?: number }) {
  const min = opts.min ?? 220
  const max = opts.max ?? 560
  const width = ref(opts.def)
  try {
    const w = parseInt(localStorage.getItem(opts.key) || '', 10)
    if (w >= min && w <= max) width.value = w
  } catch { /* ignore */ }

  function startResize(e: MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = width.value
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const move = (ev: MouseEvent) => {
      let w = startW + (ev.clientX - startX)
      w = Math.max(min, Math.min(max, w))
      width.value = w
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try { localStorage.setItem(opts.key, String(width.value)) } catch { /* ignore */ }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }
  return { width, startResize }
}
