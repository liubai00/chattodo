// P14: GSAP Draggable 看板拖拽替换 HTML5 drag。
// 用法：在 DatabaseView onMounted 中调 initDraggable(boardEl)，onBeforeUnmount 调 destroyDraggable()。
// 回调接回 useDatabaseBoard 的现有业务逻辑（patchTask + _moveInOrder + Flip）。
import { ref, nextTick } from 'vue'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { Draggable } from 'gsap/Draggable'
import {
  DURATION_IMMEDIATE,
  DURATION_FUNCTIONAL,
  EASE_ENTRANCE,
  EASE_EXIT,
  SCALE_DRAG_START,
  ROTATE_DRAG,
  prefersReducedMotion,
} from '@/motion/easings'
import type { TaskStatus } from '@/shared/enums/task-status'

gsap.registerPlugin(Draggable, Flip)

export interface KanbanDropCallbacks {
  /** 卡上 drop：dragId 移到 targetId 前，同列则只重排，跨列同时改 status */
  onDropOnCard: (dragId: string, targetId: string) => Promise<void>
  /** 列 drop：dragId 移到目标列（status）末尾 */
  onDropOnCol: (dragId: string, status: TaskStatus) => Promise<void>
  /** 返回当前卡片 id→status 的映射，用于判断跨列 */
  getCardStatus: (id: string) => TaskStatus | undefined
}

interface DraggableState {
  instance: ReturnType<typeof Draggable.create>
  flipState: ReturnType<typeof Flip.getState> | null
}

export function useKanbanDraggable(callbacks: KanbanDropCallbacks) {
  const isDragging = ref(false)
  const dragOverCol = ref<TaskStatus | null>(null)

  let draggables: DraggableState[] = []
  let _boardEl: HTMLElement | null = null
  let _dragId: string | null = null
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
          isDragging.value = true
          // 记录 Flip 状态
          const allCards = getCards(boardEl)
          const state: DraggableState = draggables.find((d) => d.instance === this) || { instance: this as unknown as ReturnType<typeof Draggable.create>, flipState: null }
          state.flipState = Flip.getState(allCards)
          if (!draggables.includes(state)) draggables.push(state)

          gsap.to(cardEl, {
            scale: SCALE_DRAG_START,
            rotate: ROTATE_DRAG,
            zIndex: 1000,
            duration: DURATION_IMMEDIATE,
            ease: EASE_ENTRANCE,
          })
        },
        onDrag() {
          // 检测悬停列
          const cols = Array.from(boardEl.querySelectorAll<HTMLElement>('[data-kanban-col]'))
          for (const col of cols) {
            const rect = col.getBoundingClientRect()
            const mx = (this as { pointerX?: number }).pointerX || 0
            const my = (this as { pointerY?: number }).pointerY || 0
            if (mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom) {
              const colKey = col.dataset.kanbanCol as TaskStatus
              if (colKey && dragOverCol.value !== colKey) {
                dragOverCol.value = colKey
              }
            }
          }
        },
        onRelease() {
          isDragging.value = false
          const dragId = _dragId
          _dragId = null

          // 还原拖拽视觉
          gsap.to(cardEl, {
            scale: 1,
            rotate: 0,
            zIndex: 1,
            duration: DURATION_IMMEDIATE,
            ease: EASE_EXIT,
          })

          if (!dragId) return

          // 清除 Draggable 应用的 transform（复位到原始位置）
          gsap.set(cardEl, { x: 0, y: 0 })

          // 判断 drop 目标
          const targetCol = dragOverCol.value
          dragOverCol.value = null

          // 找到最近的卡
          const allCards = getCards(boardEl)
          const cardRect = cardEl.getBoundingClientRect()
          const cardCenterX = cardRect.left + cardRect.width / 2
          const cardCenterY = cardRect.top + cardRect.height / 2

          let nearestCardId: string | null = null
          let nearestDist = Infinity
          for (const other of allCards) {
            if (other === cardEl) continue
            const otherRect = other.getBoundingClientRect()
            const otherCenterX = otherRect.left + otherRect.width / 2
            const otherCenterY = otherRect.top + otherRect.height / 2
            const dist = Math.hypot(cardCenterX - otherCenterX, cardCenterY - otherCenterY)
            if (dist < nearestDist && dist < 120) {
              nearestDist = dist
              nearestCardId = other.dataset.kanbanCard || null
            }
          }

          // 找到当前卡片所在 column
          const currentCol = callbacks.getCardStatus(dragId)
          const nearestCardStatus = nearestCardId ? callbacks.getCardStatus(nearestCardId) : undefined

          // 重新收集 Flip 状态（reset transform 后）
          const state = draggables.find((d) => d.instance === (Draggable.get(cardEl) as unknown as typeof d.instance))
          const flipState = state?.flipState || null

          // 执行业务逻辑
          const runMutate = async () => {
            if (targetCol && targetCol !== currentCol) {
              // 跨列 drop
              await callbacks.onDropOnCol(dragId, targetCol)
            } else if (nearestCardId && nearestCardStatus !== undefined) {
              // 卡上 drop（可能同列也可能跨列）
              await callbacks.onDropOnCard(dragId, nearestCardId)
            }
          }

          // 用 Flip 做过渡
          ;(async () => {
            await runMutate()
            if (flipState) {
              await nextTick()
              try {
                Flip.from(flipState, {
                  duration: DURATION_FUNCTIONAL,
                  ease: EASE_ENTRANCE,
                  absoluteOnLeave: true,
                  onEnter: (elements: Element[]) => {
                    const htmlElements = elements.filter((e): e is HTMLElement => e instanceof HTMLElement)
                    gsap.to(htmlElements, {
                      x: 0,
                      y: 0,
                      scale: 1,
                      rotate: 0,
                      duration: DURATION_FUNCTIONAL,
                      ease: EASE_ENTRANCE,
                    })
                  },
                })
              } catch (e) {
                console.error('[kanban draggable] flip.from:', e)
              }
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

  function destroyDraggable() {
    _cleanupFns.forEach((fn) => fn())
    _cleanupFns = []
    draggables = []
    _boardEl = null
  }

  return {
    isDragging,
    dragOverCol,
    initDraggable,
    destroyDraggable,
  }
}
