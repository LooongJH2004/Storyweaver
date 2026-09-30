import type {
  CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent,
  ReactNode, RefObject,
} from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import css from './RoleplayChrome.module.css'

interface WorkspaceDialogProps {
  readonly label: string
  readonly className: string
  readonly storageKey: string
  readonly defaultSize: WorkspaceSize
  readonly resizeLabels: ResizeLabels
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>
  readonly onClose: () => void
  readonly children: ReactNode
}

interface ResizeLabels {
  readonly top: string
  readonly right: string
  readonly bottom: string
  readonly left: string
}

type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface WorkspaceBounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

interface WorkspaceSize {
  readonly width: number
  readonly height: number
}

interface ResizeSession {
  readonly edge: ResizeEdge
  readonly pointerId: number
  readonly clientX: number
  readonly clientY: number
  readonly bounds: WorkspaceBounds
}

const resizeEdges: readonly ResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const keyboardEdges: readonly ResizeEdge[] = ['n', 'e', 's', 'w']
const workspaceStoragePrefix = 'storyweaver.workspace-size.v1:'

function rectBounds(rect: DOMRect): WorkspaceBounds {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function resizedBounds(start: WorkspaceBounds, edge: ResizeEdge, deltaX: number, deltaY: number): WorkspaceBounds {
  const margin = 16
  const maximumWidth = Math.max(0, window.innerWidth - margin * 2)
  const maximumHeight = Math.max(0, window.innerHeight - margin * 2)
  const minimumWidth = Math.min(640, maximumWidth)
  const minimumHeight = Math.min(420, maximumHeight)
  let left = start.left
  let top = start.top
  let right = start.left + start.width
  let bottom = start.top + start.height

  if (edge.includes('w')) left = clamp(start.left + deltaX, margin, right - minimumWidth)
  if (edge.includes('e')) right = clamp(right + deltaX, left + minimumWidth, window.innerWidth - margin)
  if (edge.includes('n')) top = clamp(start.top + deltaY, margin, bottom - minimumHeight)
  if (edge.includes('s')) bottom = clamp(bottom + deltaY, top + minimumHeight, window.innerHeight - margin)

  return { left, top, width: right - left, height: bottom - top }
}

function fittedBounds(bounds: WorkspaceBounds): WorkspaceBounds {
  const margin = 16
  const maximumWidth = Math.max(0, window.innerWidth - margin * 2)
  const maximumHeight = Math.max(0, window.innerHeight - margin * 2)
  const minimumWidth = Math.min(640, maximumWidth)
  const minimumHeight = Math.min(420, maximumHeight)
  const width = clamp(bounds.width, minimumWidth, maximumWidth)
  const height = clamp(bounds.height, minimumHeight, maximumHeight)
  return {
    left: clamp(bounds.left, margin, window.innerWidth - margin - width),
    top: clamp(bounds.top, margin, window.innerHeight - margin - height),
    width,
    height,
  }
}

function centeredBounds(size: WorkspaceSize): WorkspaceBounds {
  const margin = 16
  const maximumWidth = Math.max(0, window.innerWidth - margin * 2)
  const maximumHeight = Math.max(0, window.innerHeight - margin * 2)
  const minimumWidth = Math.min(640, maximumWidth)
  const minimumHeight = Math.min(420, maximumHeight)
  const width = clamp(size.width, minimumWidth, maximumWidth)
  const height = clamp(size.height, minimumHeight, maximumHeight)
  return {
    left: Math.round((window.innerWidth - width) / 2),
    top: Math.round((window.innerHeight - height) / 2),
    width,
    height,
  }
}

function readStoredSize(storageKey: string): WorkspaceSize | null {
  try {
    const serialized = window.localStorage.getItem(`${workspaceStoragePrefix}${storageKey}`)
    if (serialized === null) return null
    const value: unknown = JSON.parse(serialized)
    if (typeof value !== 'object' || value === null) return null
    const { width, height } = value as Partial<WorkspaceSize>
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    if ((width ?? 0) <= 0 || (height ?? 0) <= 0) return null
    return { width: width as number, height: height as number }
  } catch {
    return null
  }
}

function writeStoredSize(storageKey: string, bounds: WorkspaceBounds): void {
  try {
    window.localStorage.setItem(`${workspaceStoragePrefix}${storageKey}`, JSON.stringify({
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    }))
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

function initialBounds(storageKey: string, defaultSize: WorkspaceSize): WorkspaceBounds | null {
  if (window.innerWidth <= 640) return null
  return centeredBounds(readStoredSize(storageKey) ?? defaultSize)
}

function resizeCursor(edge: ResizeEdge): CSSProperties['cursor'] {
  if (edge === 'n' || edge === 's') return 'ns-resize'
  if (edge === 'e' || edge === 'w') return 'ew-resize'
  if (edge === 'ne' || edge === 'sw') return 'nesw-resize'
  return 'nwse-resize'
}

/** Accessible modal shell shared by the player-editable Story workspaces. */
export function WorkspaceDialog({
  label, className, storageKey, defaultSize, resizeLabels, returnFocusRef, onClose, children,
}: WorkspaceDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const [bounds, setBounds] = useState<WorkspaceBounds | null>(() => initialBounds(storageKey, defaultSize))
  const boundsRef = useRef<WorkspaceBounds | null>(bounds)
  const persistTimerRef = useRef<number | null>(null)
  const sizeDirtyRef = useRef(false)
  const [resizing, setResizing] = useState<ResizeEdge | null>(null)
  const persistCurrentSize = useCallback((): void => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    if (!sizeDirtyRef.current || boundsRef.current === null) return
    writeStoredSize(storageKey, boundsRef.current)
    sizeDirtyRef.current = false
  }, [storageKey])
  const scheduleStoredSize = useCallback((next: WorkspaceBounds): void => {
    boundsRef.current = next
    sizeDirtyRef.current = true
    if (persistTimerRef.current !== null) return
    persistTimerRef.current = window.setTimeout(persistCurrentSize, 120)
  }, [persistCurrentSize])
  const finishResize = useCallback((pointerId?: number): void => {
    const session = resizeSessionRef.current
    if (session === null || (pointerId !== undefined && session.pointerId !== pointerId)) return
    resizeSessionRef.current = null
    setResizing(null)
    persistCurrentSize()
  }, [persistCurrentSize])
  const close = useCallback((): void => {
    persistCurrentSize()
    onClose()
    returnFocusRef.current?.focus()
  }, [onClose, persistCurrentSize, returnFocusRef])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => { dialogRef.current?.focus() })
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [close])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const session = resizeSessionRef.current
      if (session === null || event.pointerId !== session.pointerId) return
      event.preventDefault()
      const next = resizedBounds(
        session.bounds,
        session.edge,
        event.clientX - session.clientX,
        event.clientY - session.clientY,
      )
      scheduleStoredSize(next)
      setBounds(next)
    }
    const finish = (event: PointerEvent): void => {
      finishResize(event.pointerId)
    }
    const finishActiveResize = (): void => { finishResize() }
    const finishWhenHidden = (): void => { if (document.visibilityState === 'hidden') finishResize() }
    const keepInViewport = (): void => {
      if (window.innerWidth <= 640) {
        persistCurrentSize()
        resizeSessionRef.current = null
        setResizing(null)
        boundsRef.current = null
        setBounds(null)
        return
      }
      setBounds((current) => {
        const next = current === null ? initialBounds(storageKey, defaultSize) : fittedBounds(current)
        boundsRef.current = next
        return next
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finishActiveResize)
    window.addEventListener('resize', keepInViewport)
    document.addEventListener('visibilitychange', finishWhenHidden)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finishActiveResize)
      window.removeEventListener('resize', keepInViewport)
      document.removeEventListener('visibilitychange', finishWhenHidden)
      persistCurrentSize()
    }
  }, [defaultSize.height, defaultSize.width, finishResize, persistCurrentSize, scheduleStoredSize, storageKey])

  const beginResize = (edge: ResizeEdge, event: ReactPointerEvent<HTMLElement>): void => {
    if (window.innerWidth <= 640 || dialogRef.current === null) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Global listeners still complete the resize where pointer capture is unavailable.
    }
    const nextBounds = rectBounds(dialogRef.current.getBoundingClientRect())
    resizeSessionRef.current = {
      edge, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, bounds: nextBounds,
    }
    boundsRef.current = nextBounds
    setBounds(nextBounds)
    setResizing(edge)
  }

  const resizeWithKeyboard = (edge: ResizeEdge, event: ReactKeyboardEvent<HTMLElement>): void => {
    if (dialogRef.current === null) return
    const step = event.shiftKey ? 24 : 8
    const horizontal = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const vertical = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    if ((edge === 'e' || edge === 'w') && horizontal === 0) return
    if ((edge === 'n' || edge === 's') && vertical === 0) return
    event.preventDefault()
    const start = bounds ?? rectBounds(dialogRef.current.getBoundingClientRect())
    const next = resizedBounds(start, edge, horizontal, vertical)
    scheduleStoredSize(next)
    setBounds(next)
    persistCurrentSize()
  }

  const style = bounds === null ? undefined : {
    position: 'fixed', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
    maxWidth: 'none', maxHeight: 'none',
  } satisfies CSSProperties
  const labelByEdge: Partial<Record<ResizeEdge, string>> = {
    n: resizeLabels.top, e: resizeLabels.right, s: resizeLabels.bottom, w: resizeLabels.left,
  }

  return createPortal(
    <div className={css.workspaceLayer} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <aside
        ref={dialogRef}
        className={resizing === null ? className : `${className} ${css.workspaceResizing}`}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-resizing={resizing ?? undefined}
        tabIndex={-1}
      >
        {children}
        {resizeEdges.map(edge => (
          <span
            key={edge}
            className={`${css.workspaceResizeHandle} ${css[`workspaceResize${edge.toUpperCase()}`]}`}
            style={{ cursor: resizeCursor(edge) }}
            data-resize-edge={edge}
            role={keyboardEdges.includes(edge) ? 'separator' : undefined}
            aria-label={labelByEdge[edge]}
            aria-orientation={edge === 'n' || edge === 's' ? 'horizontal' : edge === 'e' || edge === 'w' ? 'vertical' : undefined}
            aria-valuenow={bounds === null ? undefined : Math.round(edge === 'n' || edge === 's' ? bounds.height : bounds.width)}
            tabIndex={keyboardEdges.includes(edge) ? 0 : -1}
            onPointerDown={(event) => { beginResize(edge, event) }}
            onPointerUp={(event) => { finishResize(event.pointerId) }}
            onPointerCancel={(event) => { finishResize(event.pointerId) }}
            onLostPointerCapture={(event) => { finishResize(event.pointerId) }}
            onKeyDown={(event) => { resizeWithKeyboard(edge, event) }}
          />
        ))}
      </aside>
    </div>,
    document.body,
  )
}

/** Always-visible exit action for a modal Story workspace. */
export function WorkspaceCloseButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" className={css.workspaceCloseButton} aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
      <span>{label}</span>
    </button>
  )
}
