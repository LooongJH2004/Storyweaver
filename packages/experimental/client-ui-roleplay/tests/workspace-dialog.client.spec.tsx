// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceDialog } from '../src/client/WorkspaceDialog.tsx'

const originalInnerWidth = window.innerWidth
const originalInnerHeight = window.innerHeight

beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
})

const resizeLabels = {
  top: '调整顶部边界',
  right: '调整右侧边界',
  bottom: '调整底部边界',
  left: '调整左侧边界',
}

const defaultSize = { width: 1040, height: 900 }

describe('WorkspaceDialog resizing', () => {
  it('exposes four keyboard-operable edges and four pointer corners without a fullscreen mode', () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    render(
      <>
        <button ref={returnFocusRef} type="button">返回</button>
        <WorkspaceDialog
          label="测试工作区"
          className="workspace"
          storageKey="test-outline"
          defaultSize={defaultSize}
          resizeLabels={resizeLabels}
          returnFocusRef={returnFocusRef}
          onClose={vi.fn()}
        >
          <p>内容</p>
        </WorkspaceDialog>
      </>,
    )

    const dialog = screen.getByRole('dialog', { name: '测试工作区' })
    expect(dialog.hasAttribute('data-size')).toBe(false)
    expect(dialog.querySelectorAll('[data-resize-edge]')).toHaveLength(8)
    expect(screen.getByRole('separator', { name: resizeLabels.top })).toBeTruthy()
    expect(screen.getByRole('separator', { name: resizeLabels.right })).toBeTruthy()
    expect(screen.getByRole('separator', { name: resizeLabels.bottom })).toBeTruthy()
    expect(screen.getByRole('separator', { name: resizeLabels.left })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /全屏|恢复标准/u })).toBeNull()
  })

  it('resizes from a side while anchoring the opposite edge and supports arrow keys', () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    render(
      <WorkspaceDialog
        label="测试工作区"
        className="workspace"
        storageKey="test-outline"
        defaultSize={defaultSize}
        resizeLabels={resizeLabels}
        returnFocusRef={returnFocusRef}
        onClose={vi.fn()}
      >
        <p>内容</p>
      </WorkspaceDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: '测试工作区' })
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 80, left: 100, top: 80, right: 800, bottom: 580,
      width: 700, height: 500, toJSON: () => ({}),
    })
    const right = screen.getByRole('separator', { name: resizeLabels.right })
    fireEvent.pointerDown(right, { pointerId: 1, clientX: 800, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 860, clientY: 300 })

    expect(dialog.style.left).toBe('100px')
    expect(dialog.style.width).toBe('760px')
    expect(dialog.style.height).toBe('500px')

    fireEvent.pointerUp(window, { pointerId: 1 })
    fireEvent.keyDown(right, { key: 'ArrowRight' })
    expect(dialog.style.width).toBe('768px')
  })

  it('starts with the taller default size centered inside the viewport', () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    render(
      <WorkspaceDialog
        label="测试工作区"
        className="workspace"
        storageKey="test-outline"
        defaultSize={defaultSize}
        resizeLabels={resizeLabels}
        returnFocusRef={returnFocusRef}
        onClose={vi.fn()}
      >
        <p>内容</p>
      </WorkspaceDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: '测试工作区' })
    expect(dialog.style.width).toBe('1040px')
    expect(dialog.style.height).toBe('900px')
    expect(dialog.style.left).toBe('200px')
    expect(dialog.style.top).toBe('150px')
  })

  it('persists only the resized dimensions and restores them on the next open', () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    const renderWorkspace = (storageKey = 'test-outline') => render(
      <WorkspaceDialog
        label="测试工作区"
        className="workspace"
        storageKey={storageKey}
        defaultSize={defaultSize}
        resizeLabels={resizeLabels}
        returnFocusRef={returnFocusRef}
        onClose={vi.fn()}
      >
        <p>内容</p>
      </WorkspaceDialog>,
    )

    const first = renderWorkspace()
    const dialog = screen.getByRole('dialog', { name: '测试工作区' })
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 150, left: 200, top: 150, right: 1240, bottom: 1050,
      width: 1040, height: 900, toJSON: () => ({}),
    })
    const bottom = screen.getByRole('separator', { name: resizeLabels.bottom })
    fireEvent.pointerDown(bottom, { pointerId: 7, clientX: 700, clientY: 1050 })
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 700, clientY: 1120 })
    fireEvent.pointerUp(window, { pointerId: 7 })

    expect(JSON.parse(window.localStorage.getItem('storyweaver.workspace-size.v1:test-outline') ?? '')).toEqual({
      width: 1040,
      height: 970,
    })

    first.unmount()
    renderWorkspace()
    const restored = screen.getByRole('dialog', { name: '测试工作区' })
    expect(restored.style.width).toBe('1040px')
    expect(restored.style.height).toBe('970px')
    expect(restored.style.left).toBe('200px')
    expect(restored.style.top).toBe('115px')

    cleanup()
    renderWorkspace('test-storybook')
    expect(screen.getByRole('dialog', { name: '测试工作区' }).style.height).toBe('900px')
  })

  it('flushes an adjusted size when the workspace closes before pointerup is observed', () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    const renderWorkspace = () => render(
      <WorkspaceDialog
        label="测试工作区"
        className="workspace"
        storageKey="test-interrupted-resize"
        defaultSize={defaultSize}
        resizeLabels={resizeLabels}
        returnFocusRef={returnFocusRef}
        onClose={vi.fn()}
      >
        <p>内容</p>
      </WorkspaceDialog>,
    )

    const first = renderWorkspace()
    const dialog = screen.getByRole('dialog', { name: '测试工作区' })
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 150, left: 200, top: 150, right: 1240, bottom: 1050,
      width: 1040, height: 900, toJSON: () => ({}),
    })
    const left = screen.getByRole('separator', { name: resizeLabels.left })
    fireEvent.pointerDown(left, { pointerId: 11, clientX: 200, clientY: 600 })
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 120, clientY: 600 })
    first.unmount()

    renderWorkspace()
    const restored = screen.getByRole('dialog', { name: '测试工作区' })
    expect(restored.style.width).toBe('1120px')
    expect(restored.style.height).toBe('900px')
  })
})
