import { useRef } from 'react'

const LONG_PRESS_MILLISECONDS = 500
const MOVE_TOLERANCE_PIXELS = 10

type LongPressHandlers = {
  readonly onTouchStart: (event: React.TouchEvent) => void
  readonly onTouchMove: (event: React.TouchEvent) => void
  readonly onTouchEnd: () => void
  readonly onMouseDown: () => void
  readonly onMouseUp: () => void
  readonly onMouseLeave: () => void
  readonly onClick: () => void
}

/**
 * Tap vs. long-press on a tile (design/pure prototypes: tap checks off,
 * holding 500ms opens the detail sheet). Touch for devices, mouse for
 * browser development. A triggered long-press swallows the following click.
 */
export function useLongPress(
  onLongPress: () => void,
  onTap: () => void,
): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const touchStart = useRef<{ readonly x: number; readonly y: number } | null>(
    null,
  )

  const startTimer = () => {
    longPressTriggered.current = false
    timer.current = setTimeout(() => {
      longPressTriggered.current = true
      onLongPress()
    }, LONG_PRESS_MILLISECONDS)
  }

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return {
    onTouchStart: (event) => {
      const touch = event.touches[0]
      touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
      startTimer()
    },
    onTouchMove: (event) => {
      const touch = event.touches[0]
      if (!touch || !touchStart.current) return
      const movedX = Math.abs(touch.clientX - touchStart.current.x)
      const movedY = Math.abs(touch.clientY - touchStart.current.y)
      if (movedX > MOVE_TOLERANCE_PIXELS || movedY > MOVE_TOLERANCE_PIXELS) {
        cancelTimer()
      }
    },
    onTouchEnd: cancelTimer,
    onMouseDown: startTimer,
    onMouseUp: cancelTimer,
    onMouseLeave: cancelTimer,
    onClick: () => {
      if (longPressTriggered.current) {
        longPressTriggered.current = false
        return
      }
      onTap()
    },
  }
}
