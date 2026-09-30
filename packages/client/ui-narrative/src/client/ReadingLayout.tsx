import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import css from './Narrative.module.css'

const WIDTH_KEY = 'dsh.conversation.contentWidth'
const HEIGHT_KEY = 'storyweaver.composerHeight'

function preference(key: string): number | null {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)))
}

/** Keep preferred dimensions across windows; clamp only their displayed size to the available space.
 * @param root - The local story viewport.
 * @param embody - Use the separately remembered height for the two-field player response.
 * @returns Live dimensions and pointer/keyboard preference actions.
 */
export function useReadingLayout(root: RefObject<HTMLElement>, embody = false) {
  const [width, setWidth] = useState(() => preference(WIDTH_KEY))
  const [heights, setHeights] = useState(() => ({ normal: preference(HEIGHT_KEY), embody: preference(`${HEIGHT_KEY}.embody`) }))
  const heightMode = embody ? 'embody' : 'normal'
  const heightKey = embody ? `${HEIGHT_KEY}.embody` : HEIGHT_KEY
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  const [viewport, setViewport] = useState({ width: 1200, height: 900 })
  useEffect(() => {
    const element = root.current
    if (element === null) return
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [root])
  const maxWidth = Math.max(240, viewport.width - (viewport.width < 760 ? 24 : 64))
  const minWidth = Math.min(520, maxWidth)
  const minHeight = 224
  const maxHeight = Math.max(minHeight, Math.min(640, Math.floor(viewport.height * 0.7)))
  const resolvedWidth = clamp(previewWidth ?? width ?? Math.min(920, Math.max(680, viewport.width * 0.7)), minWidth, maxWidth)
  const resolvedHeight = clamp(previewHeight ?? heights[heightMode] ?? (embody ? 560 : 256), minHeight, maxHeight)
  useEffect(() => {
    root.current?.style.setProperty('--dsh-chat-content-width', `${resolvedWidth}px`)
    root.current?.style.setProperty('--narrative-composer-height', `${resolvedHeight}px`)
  }, [root, resolvedWidth, resolvedHeight])
  return {
    width: resolvedWidth, height: resolvedHeight, minWidth, maxWidth, minHeight, maxHeight,
    resizeWidth: (value: number, commit = true) => {
      if (!commit) { setPreviewWidth(value); return }
      const next = clamp(value, minWidth, maxWidth)
      setPreviewWidth(null); setWidth(next); localStorage.setItem(WIDTH_KEY, String(next))
    },
    resizeHeight: (value: number, commit = true) => {
      if (!commit) { setPreviewHeight(value); return }
      const next = clamp(value, minHeight, maxHeight)
      setPreviewHeight(null); setHeights(value => ({ ...value, [heightMode]: next })); localStorage.setItem(heightKey, String(next))
    },
    cancelWidth: () => { setPreviewWidth(null) },
    cancelHeight: () => { setPreviewHeight(null) },
    reset: () => {
      setWidth(null); setHeights(value => ({ ...value, [heightMode]: null })); setPreviewWidth(null); setPreviewHeight(null)
      localStorage.removeItem(WIDTH_KEY); localStorage.removeItem(heightKey)
    },
  }
}

/** A captured resize gesture previews continuously and commits only on release; Escape cancels.
 * @param props - Axis, resolved bounds, localized label and dimension callbacks.
 * @returns A focusable separator supporting arrows, Home/End and double-click reset.
 */
export function ResizeGrip(props: {
  axis: 'left' | 'right' | 'top'
  value: number
  min: number
  max: number
  label: string
  resize: (value: number, commit?: boolean) => void
  cancel: () => void
  reset: () => void
}) {
  const drag = useRef<{ pointer: number; origin: number; value: number } | null>(null)
  const [active, setActive] = useState(false)
  const horizontal = props.axis !== 'top'
  const delta = (x: number, y: number) => {
    const start = drag.current
    if (start === null) return props.value
    return clamp(start.value + (horizontal ? (x - start.origin) * (props.axis === 'left' ? -2 : 2)
      : start.origin - y), props.min, props.max)
  }
  const cancel = () => { drag.current = null; setActive(false); props.cancel() }
  return <div className={horizontal ? css.widthGrip : css.heightGrip} data-side={props.axis} data-dragging={active}
    role="separator" tabIndex={0} aria-label={props.label} title={props.label}
    aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-valuemin={props.min} aria-valuemax={props.max} aria-valuenow={props.value}
    onPointerDown={(event) => {
      if (event.button !== 0 || drag.current !== null) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointer: event.pointerId, origin: horizontal ? event.clientX : event.clientY, value: props.value }
      setActive(true)
    }}
    onPointerMove={(event) => {
      if (drag.current?.pointer === event.pointerId) props.resize(delta(event.clientX, event.clientY), false)
    }}
    onPointerUp={(event) => {
      const start = drag.current
      if (start?.pointer !== event.pointerId) return
      const value = delta(event.clientX, event.clientY)
      if (value !== start.value) props.resize(value)
      else props.cancel()
      drag.current = null; setActive(false); event.currentTarget.releasePointerCapture(event.pointerId)
    }} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onDoubleClick={props.reset}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { cancel(); return }
      const sign = props.axis === 'left' ? -1 : 1
      const step = event.shiftKey ? 80 : 20
      const next = event.key === 'Home' ? props.min : event.key === 'End' ? props.max
        : event.key === (horizontal ? 'ArrowRight' : 'ArrowUp') ? props.value + step * sign
          : event.key === (horizontal ? 'ArrowLeft' : 'ArrowDown') ? props.value - step * sign : null
      if (next === null) return
      event.preventDefault(); props.resize(clamp(next, props.min, props.max))
    }}><span aria-hidden="true" /></div>
}
