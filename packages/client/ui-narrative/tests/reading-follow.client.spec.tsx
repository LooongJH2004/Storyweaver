// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useReadingFollow } from '../src/client/ReadingFollow.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('resumes a paused reading position after visiting another panel and resets for a different story', () => {
  let resize = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe = vi.fn()
    disconnect = vi.fn()
  })
  const viewport = { current: document.createElement('main') }
  const content = { current: document.createElement('div') }
  let height = 1000
  let top = 0
  Object.defineProperties(viewport.current, {
    clientHeight: { get: () => 200 }, scrollHeight: { get: () => height },
    scrollTop: { get: () => top, set: (value: number) => { top = Math.min(height - 200, value) } },
  })
  const hook = renderHook(({ scope }: { scope: string | null }) => useReadingFollow(viewport, content, scope),
    { initialProps: { scope: 'story:observer' as string | null } })
  top = 250
  act(() => { hook.result.current.onScroll() })
  hook.rerender({ scope: null })
  top = 600
  act(() => { hook.result.current.onScroll() })
  expect(hook.result.current.showLatest).toBe(false)
  height = 2000
  top = 0
  hook.rerender({ scope: 'story:observer' })
  act(() => { resize(); hook.result.current.onScroll() })
  expect(top).toBe(250)
  expect(hook.result.current.showLatest).toBe(true)
  act(() => { hook.result.current.latest() })
  hook.rerender({ scope: null })
  height = 2500
  top = 0
  hook.rerender({ scope: 'story:observer' })
  expect(top).toBe(2300)
  top = 300
  act(() => { hook.result.current.onScroll() })
  hook.rerender({ scope: 'another-story:observer' })
  expect(top).toBe(2300)
  expect(hook.result.current.showLatest).toBe(false)
})

it('ignores queued scroll events from an earlier chunk and pauses only when the reader moves up', () => {
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe = vi.fn()
    disconnect = disconnect
  })
  const viewport = { current: document.createElement('main') }
  const content = { current: document.createElement('div') }
  let height = 1000
  let top = 0
  Object.defineProperties(viewport.current, {
    clientHeight: { get: () => 200 }, scrollHeight: { get: () => height },
    scrollTop: { get: () => top, set: (value: number) => { top = Math.min(height - 200, value) } },
  })
  const hook = renderHook(() => useReadingFollow(viewport, content, 'story:observer'))
  expect(top).toBe(800)
  height = 1500
  act(() => { hook.result.current.onScroll(); resize() })
  expect(top).toBe(1300)
  expect(hook.result.current.showLatest).toBe(false)
  top = 200
  act(() => { hook.result.current.onScroll() })
  height = 2000
  act(() => { resize() })
  expect(top).toBe(200)
  expect(hook.result.current.showLatest).toBe(true)
  act(() => { hook.result.current.latest() })
  expect(top).toBe(1800)
  expect(hook.result.current.showLatest).toBe(false)
  hook.unmount()
  expect(disconnect).toHaveBeenCalledTimes(1)
})
