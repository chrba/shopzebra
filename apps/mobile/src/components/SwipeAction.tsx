import { useRef, useCallback, useEffect } from 'react'
import { LogOut, Trash2 } from 'lucide-react'

const ACTION_ZONE_WIDTH = 70
const SWIPE_THRESHOLD = 40
const DIRECTION_LOCK_THRESHOLD = 10

/**
 * What the revealed action does to the swiped thing. `destructive` is the
 * red, irreversible one (deleting); `parting` only ends this device's own
 * involvement (leaving a list somebody else owns) and is deliberately not
 * red — nothing is destroyed.
 */
export type SwipeActionTone = 'destructive' | 'parting'

type SwipeActionProps = {
  readonly children: React.ReactNode
  readonly isOpen: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
  /** Verb on the revealed button — "Löschen", "Verlassen". */
  readonly label: string
  readonly tone: SwipeActionTone
  readonly onTrigger: () => void
}

/**
 * Wrapper that reveals one action when the child is swiped. Which action
 * that is belongs to the caller: a list I own is deleted, a list somebody
 * shared with me is left.
 * @param props.children The content that can be swiped.
 * @param props.isOpen Whether the action zone is currently revealed.
 * @param props.onOpen Called when the swipe exceeds the
 *   threshold and the action zone should open.
 * @param props.onClose Called when the swipe snaps back
 *   or the foreground is tapped while open.
 * @param props.label The verb shown next to the icon.
 * @param props.tone Destructive (red) or parting (neutral).
 * @param props.onTrigger Called when the revealed button is tapped.
 */
export function SwipeAction({
  children,
  isOpen,
  onOpen,
  onClose,
  label,
  tone,
  onTrigger,
}: SwipeActionProps) {
  const foregroundRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const directionLockedRef = useRef(false)
  const isScrollingRef = useRef(false)
  const hasMovedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const isOpenRef = useRef(isOpen)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)

  isOpenRef.current = isOpen
  onOpenRef.current = onOpen
  onCloseRef.current = onClose

  // Sync open/close state from parent
  useEffect(() => {
    const el = foregroundRef.current
    if (!el) return
    el.style.transition = 'transform 0.25s ease-out'
    el.style.transform = isOpen
      ? `translateX(${ACTION_ZONE_WIDTH}px)`
      : 'translateX(0)'
    const timerId = setTimeout(() => {
      el.style.transition = ''
    }, 250)
    return () => clearTimeout(timerId)
  }, [isOpen])

  // Shared drag logic — called from both touch and mouse handlers
  const startDrag = useCallback((clientX: number, clientY: number) => {
    startXRef.current = clientX
    startYRef.current = clientY
    directionLockedRef.current = false
    isScrollingRef.current = false
    hasMovedRef.current = false
    isDraggingRef.current = true
    const el = foregroundRef.current
    if (el) el.style.transition = ''
  }, [])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return

    const deltaX = clientX - startXRef.current
    const deltaY = clientY - startYRef.current

    if (!directionLockedRef.current) {
      if (
        Math.abs(deltaX) < DIRECTION_LOCK_THRESHOLD &&
        Math.abs(deltaY) < DIRECTION_LOCK_THRESHOLD
      ) {
        return
      }
      directionLockedRef.current = true
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        isScrollingRef.current = true
        return
      }
    }

    if (isScrollingRef.current) return

    hasMovedRef.current = true

    // Swipe RIGHT to reveal delete on the left
    const baseX = isOpenRef.current ? ACTION_ZONE_WIDTH : 0
    const rawX = baseX + deltaX
    const clampedX = Math.min(ACTION_ZONE_WIDTH, Math.max(0, rawX))

    const el = foregroundRef.current
    if (el) el.style.transform = `translateX(${clampedX}px)`
  }, [])

  const endDrag = useCallback(() => {
    isDraggingRef.current = false

    if (isScrollingRef.current || !hasMovedRef.current) return

    const el = foregroundRef.current
    if (!el) return

    const matrix = new DOMMatrix(getComputedStyle(el).transform)
    const currentX = matrix.m41

    el.style.transition = 'transform 0.25s ease-out'

    if (currentX > SWIPE_THRESHOLD) {
      el.style.transform = `translateX(${ACTION_ZONE_WIDTH}px)`
      onOpenRef.current()
    } else {
      el.style.transform = 'translateX(0)'
      onCloseRef.current()
    }

    setTimeout(() => {
      if (el) el.style.transition = ''
    }, 250)
  }, [])

  // Touch handlers (mobile)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      startDrag(touch.clientX, touch.clientY)
    },
    [startDrag],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      moveDrag(touch.clientX, touch.clientY)
    },
    [moveDrag],
  )

  const handleTouchEnd = useCallback(() => {
    endDrag()
  }, [endDrag])

  // Mouse handlers (desktop Chrome)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Prevent browser's native drag (e.g. dragging emoji text) which
      // would hijack mousemove events and break the swipe gesture.
      // This does NOT prevent click events.
      e.preventDefault()
      startDrag(e.clientX, e.clientY)

      const onMouseMove = (ev: MouseEvent) => moveDrag(ev.clientX, ev.clientY)
      const onMouseUp = () => {
        endDrag()
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [startDrag, moveDrag, endDrag],
  )

  const handleForegroundClick = useCallback((e: React.MouseEvent) => {
    if (hasMovedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      hasMovedRef.current = false
      return
    }
    if (isOpenRef.current) {
      e.stopPropagation()
      e.preventDefault()
      onCloseRef.current()
    }
  }, [])

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl">
      {/* Background: the action on the left, revealed on swipe right */}
      <div
        className={`absolute inset-0 z-0 flex items-center justify-start pl-5 ${
          tone === 'destructive' ? 'bg-destructive/15' : 'bg-teal/15'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onTrigger()
        }}
      >
        <div
          className={`flex size-10 items-center justify-center rounded-full ${
            tone === 'destructive' ? 'bg-destructive/20' : 'bg-teal/20'
          }`}
        >
          {tone === 'destructive' ? (
            <Trash2 className="text-destructive size-5" />
          ) : (
            <LogOut className="text-teal size-5" />
          )}
        </div>
        <span
          className={`ml-2 text-[11px] font-bold ${
            tone === 'destructive' ? 'text-destructive' : 'text-teal'
          }`}
        >
          {label}
        </span>
      </div>

      {/* Foreground: Slides right to reveal delete.
          bg-background prevents bleed-through during Card's active:scale.
          flex-1 + [&>*]:flex-1 ensures Card fills full grid-row height. */}
      <div
        ref={foregroundRef}
        className="bg-background relative z-10 flex flex-1 flex-col select-none touch-pan-y [&>*]:flex-1"
        style={{ willChange: 'transform' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClickCapture={handleForegroundClick}
      >
        {children}
      </div>
    </div>
  )
}
