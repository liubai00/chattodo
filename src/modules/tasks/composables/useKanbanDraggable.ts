// P14: GSAP Draggable 看板拖拽替换 HTML5 drag。
// 用法：在 DatabaseView 中 watch boardEl+dbLayout 调 initDraggable(boardEl)，onBeforeUnmount 调 destroyDraggable()。
// 回调接回 useDatabaseBoard 的现有业务逻辑（patchTask + _moveInOrder + Flip）。
//
// 修复要点（2026-07-12）：
//   1. 克隆浮层：按下时克隆卡到 document.body（position:fixed, z-index 高），原卡 opacity:0 占位。
//      规避列 overflow:hidden 裁剪 + 卡片 position:static 致 z-index 失效 —— 否则拖动块被邻列覆盖。
//   2. 单 Flip：释放后只复位原卡视觉，Flip 交由 useDatabaseBoard.flipBoard 统一处理，禁止双 Flip 打架
//      （旧实现 onRelease 自带一次 Flip.from，与 flipBoard 的 Flip.from 冲突，导致列「歪掉」）。
//   3. 释放重绑：跨列后 Vue 重建卡片节点（旧节点销毁、新节点无 Draggable），故 drop 完成后重新 init，
//      否则拖到「进行中」后无法再拖动。
import { ref, nextTick } from 'vue'
import gsap from 'gsap'
import { Draggable } from 'gsap/Draggable'
import {
  SCALE_DRAG_START,
  ROTATE_DRAG,
  prefersReducedMotion,
} from '@/motion/easings'
import type { TaskStatus } from '@/shared/enums/task-status'

gsap.registerPlugin(Draggable)

export interface KanbanDropCallbacks {
  /** 卡上 drop：dragId 移到 targetId 前，同列则只重排，跨列同时改 status */
  onDropOnCard: (dragId: string, targetId: string) => Promise<void>
  /** 列 drop：dragId 移到目标列（status）末尾 */
  onDropOnCol: (dragId: string, status: TaskStatus) => Promise<void>
  /** 返回当前卡片 id->status 的映射，用于判断跨列 */
  getCardStatus: (id: string) => TaskStatus | undefined
  /** 设置当前拖拽中的 card id（供 useDatabaseBoard.setDragId） */
  setDragId: (id: string | null) => void
  /** 拖拽悬停列变化通知（供 useDatabaseBoard 高亮目标列；null 清除） */
  onHoverCol?: (status: TaskStatus | null) => void
}

/** Draggable 回调里的 this 形态（仅取用到的字段）。 */
type DragCtx = { x?: number; y?: number; pointerX?: number; pointerY?: number }

export function useKanbanDraggable(callbacks: KanbanDropCallbacks) {
  const isDragging = ref(false)

  let _boardEl: HTMLElement | null = null
  let _dragId: string | null = null
  let _hoverCol: TaskStatus | null = null
  let _clone: HTMLElement | null = null
  let _cleanupFns: Array<() => void> = []

  function getCards(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-kanban-card]'))
  }

  function initDraggable(boardEl: HTMLElement) {
    if (prefersReducedMotion() || window.innerWidth < 820) return
    destroyDraggable()
    _boardEl = boardEl
    _cleanupFns = []

    const cards = getCards(boardEl)
    for (const cardEl of cards) {
      const id = cardEl.dataset.kanbanCard || ''
      if (!id) continue

      const instance = Draggable.create(cardEl, {
        type: 'x,y',
        bounds: boardEl,
        onPress() {
          _dragId = id
          callbacks.setDragId(id)
          isDragging.value = true

          // 克隆浮层：脱离列 overflow/堆叠限制，浮于所有列之上。
          const rect = cardEl.getBoundingClientRect()
          _clone = cardEl.cloneNode(true) as HTMLElement
          _clone.removeAttribute('data-kanban-card')
          _clone.removeAttribute('data-flip-id')
          Object.assign(_clone.style, {
            position: 'fixed',
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
            margin: '0',
            pointerEvents: 'none',
            zIndex: '9999',
            boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
          })
          document.body.appendChild(_clone)
          gsap.set(_clone, { scale: SCALE_DRAG_START, rotate: ROTATE_DRAG, transformOrigin: 'center center' })

          // 原卡隐形占位（保留布局供 Flip；transform 由 Draggable 驱动但不可见）。
          gsap.set(cardEl, { opacity: 0 })
        },
        onDrag() {
          if (!_clone) return
          const ctx = this as unknown as DragCtx
          // 克隆跟随 Draggable 的 x/y（transform，cheap）。
          gsap.set(_clone, { x: ctx.x || 0, y: ctx.y || 0 })

          // 检测悬停列（指针位置）。
          const px = ctx.pointerX || 0
          const py = ctx.pointerY || 0
          const cols = Array.from(boardEl.querySelectorAll<HTMLElement>('[data-kanban-col]'))
          for (const col of cols) {
            const r = col.getBoundingClientRect()
            if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
              const k = col.dataset.kanbanCol as TaskStatus
              if (k && _hoverCol !== k) {
                _hoverCol = k
                callbacks.onHoverCol?.(k)
              }
              break
            }
          }
        },
        onRelease() {
          isDragging.value = false
          const dragId = _dragId
          _dragId = null
          callbacks.setDragId(null)

          // 用克隆位置判定 drop 目标（用户实际释放点）。
          const dropRect = _clone ? _clone.getBoundingClientRect() : cardEl.getBoundingClientRect()
          const cx = dropRect.left + dropRect.width / 2
          const cy = dropRect.top + dropRect.height / 2

          // 清理克隆 + 瞬间复位原卡视觉（Flip 由 flipBoard 接管，这里不动画、不做 Flip）。
          if (_clone) { _clone.remove(); _clone = null }
          gsap.set(cardEl, { opacity: 1, zIndex: 1, clearProps: 'transform' })

          const targetCol = _hoverCol
          _hoverCol = null
          callbacks.onHoverCol?.(null)

          if (!dragId) { void rebind(); return }

          // 找最近卡（用释放位置）。
          const allCards = getCards(boardEl)
          let nearestCardId: string | null = null
          let nearestDist = Infinity
          for (const other of allCards) {
            if (other === cardEl) continue
            const r = other.getBoundingClientRect()
            const ox = r.left + r.width / 2
            const oy = r.top + r.height / 2
            const d = Math.hypot(cx - ox, cy - oy)
            if (d < nearestDist && d < 120) {
              nearestDist = d
              nearestCardId = other.dataset.kanbanCard || null
            }
          }

          const currentCol = callbacks.getCardStatus(dragId)
          const nearestCardStatus = nearestCardId ? callbacks.getCardStatus(nearestCardId) : undefined

          ;(async () => {
            try {
              if (targetCol && targetCol !== currentCol) {
                await callbacks.onDropOnCol(dragId, targetCol)
              } else if (nearestCardId && nearestCardStatus !== undefined) {
                await callbacks.onDropOnCard(dragId, nearestCardId)
              }
            } finally {
              // drop 后 Vue 可能重建卡片节点（跨列时旧节点销毁、新节点无 Draggable）。
              // onDropOn* 已等 Flip 完成（flipBoard 内部 await），故此处重绑不会捕获到动画中的 transform。
              await nextTick()
              rebind()
            }
          })()
        },
      })

      _cleanupFns.push(() => {
        const arr = instance as unknown as Array<{ kill?: () => void }>
        try { arr[0]?.kill?.() } catch { /* ignore */ }
      })
    }
  }

  /** drop 后 Vue 可能重建卡片节点，重新绑定 Draggable 到最新 DOM。 */
  function rebind() {
    if (_boardEl) initDraggable(_boardEl)
  }

  function destroyDraggable() {
    _cleanupFns.forEach((fn) => fn())
    _cleanupFns = []
    if (_clone) { _clone.remove(); _clone = null }
    _hoverCol = null
    _boardEl = null
  }

  return {
    isDragging,
    initDraggable,
    destroyDraggable,
  }
}
