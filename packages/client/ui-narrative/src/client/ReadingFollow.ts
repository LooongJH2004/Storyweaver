/** Follow growing prose before paint, while preserving a reader's explicit scroll position. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * @param viewport - The story's scroll container.
 * @param content - The column containing accepted and streaming replies.
 * @param scope - Active story/perspective identity, or null outside live play.
 * @returns Scroll tracking and an explicit return-to-latest action.
 */
export function useReadingFollow(viewport: RefObject<HTMLElement>, content: RefObject<HTMLElement>, scope: string | null) {
  const following = useRef(true)
  const previousTop = useRef(0)
  const lastScope = useRef<string | null>(null)
  const [showLatest, setShowLatest] = useState(false)
  const latest = useCallback(() => {
    following.current = true
    setShowLatest(false)
    const element = viewport.current
    if (element !== null) {
      element.scrollTop = element.scrollHeight
      previousTop.current = element.scrollTop
    }
  }, [viewport])
  useLayoutEffect(() => {
    if (scope === null || content.current === null) return
    // Leaving play suspends tracking. The other panel shares this viewport, so
    // use the last tracked position, not its scrollTop during effect cleanup.
    if (lastScope.current !== scope || following.current) latest()
    else if (viewport.current !== null) viewport.current.scrollTop = previousTop.current
    lastScope.current = scope
    setShowLatest(!following.current)
    // ResizeObserver runs before paint, including updates owned by the live child.
    const observer = new ResizeObserver(() => {
      if (following.current) latest()
      else setShowLatest(true)
    })
    observer.observe(content.current)
    return () => { observer.disconnect() }
  }, [scope, content, latest, viewport])
  const onScroll = () => {
    const element = viewport.current
    if (scope === null || element === null) return
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120
    // A queued scroll event can arrive after the next chunk grows the column.
    // Only upward movement opts out; distance alone mistakes that event for reader intent.
    if (atBottom) following.current = true
    else if (element.scrollTop < previousTop.current - 1) following.current = false
    previousTop.current = element.scrollTop
    setShowLatest(!following.current)
  }
  return { showLatest: scope !== null && showLatest, latest, onScroll }
}
