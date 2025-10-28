import { useEffect, useCallback, useRef } from 'react'
import type { Tool, EditorState } from './types'

/**
 * Keyboard shortcut definitions and handlers for professional editor experience
 */

export interface KeyboardShortcut {
  keys: string[]
  description: string
  handler: () => void
  preventDefault?: boolean
}

export interface UseKeyboardShortcutsOptions {
  onUndo?: () => void
  onRedo?: () => void
  onDelete?: () => void
  onEscape?: () => void
  onSelectAll?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onFitView?: () => void
  onSelectTool?: (tool: Tool) => void
  enabled?: boolean
}

/**
 * Custom hook for handling keyboard shortcuts
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const {
    onUndo,
    onRedo,
    onDelete,
    onEscape,
    onSelectAll,
    onCopy,
    onPaste,
    onZoomIn,
    onZoomOut,
    onFitView,
    onSelectTool,
    enabled = true
  } = options

  const shortcuts = useRef<KeyboardShortcut[]>([
    // Edit operations
    {
      keys: ['ctrl+z', 'cmd+z'],
      description: 'Undo last action',
      handler: () => onUndo?.(),
      preventDefault: true
    },
    {
      keys: ['ctrl+y', 'cmd+y', 'ctrl+shift+z', 'cmd+shift+z'],
      description: 'Redo last undone action',
      handler: () => onRedo?.(),
      preventDefault: true
    },
    {
      keys: ['delete', 'backspace'],
      description: 'Delete selected elements',
      handler: () => onDelete?.(),
      preventDefault: true
    },
    {
      keys: ['escape'],
      description: 'Cancel current operation or clear selection',
      handler: () => onEscape?.(),
      preventDefault: false
    },
    
    // Selection operations
    {
      keys: ['ctrl+a', 'cmd+a'],
      description: 'Select all elements',
      handler: () => onSelectAll?.(),
      preventDefault: true
    },
    {
      keys: ['ctrl+c', 'cmd+c'],
      description: 'Copy selected elements',
      handler: () => onCopy?.(),
      preventDefault: true
    },
    {
      keys: ['ctrl+v', 'cmd+v'],
      description: 'Paste copied elements',
      handler: () => onPaste?.(),
      preventDefault: true
    },
    
    // View operations
    {
      keys: ['ctrl+=', 'cmd+=', 'ctrl+plus'],
      description: 'Zoom in',
      handler: () => onZoomIn?.(),
      preventDefault: true
    },
    {
      keys: ['ctrl+-', 'cmd+-'],
      description: 'Zoom out',
      handler: () => onZoomOut?.(),
      preventDefault: true
    },
    {
      keys: ['ctrl+0', 'cmd+0'],
      description: 'Fit view to content',
      handler: () => onFitView?.(),
      preventDefault: true
    },
    
    // Tool shortcuts
    {
      keys: ['v'],
      description: 'Select tool',
      handler: () => onSelectTool?.('select'),
      preventDefault: false
    },
    {
      keys: ['r'],
      description: 'Rectangle tool',
      handler: () => onSelectTool?.('rectangle'),
      preventDefault: false
    },
    {
      keys: ['c'],
      description: 'Circle tool',
      handler: () => onSelectTool?.('circle'),
      preventDefault: false
    },
    {
      keys: ['p'],
      description: 'Polygon tool',
      handler: () => onSelectTool?.('room'),
      preventDefault: false
    },
    {
      keys: ['a'],
      description: 'Artwork tool',
      handler: () => onSelectTool?.('artwork'),
      preventDefault: false
    },
    {
      keys: ['d'],
      description: 'Door tool',
      handler: () => onSelectTool?.('door'),
      preventDefault: false
    },
    {
      keys: ['s'],
      description: 'Stairs tool',
      handler: () => onSelectTool?.('stairs'),
      preventDefault: false
    },
    {
      keys: ['e'],
      description: 'Elevator tool',
      handler: () => onSelectTool?.('elevator'),
      preventDefault: false
    }
  ])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    // Don't handle shortcuts when typing in input fields
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    const pressedKey = formatKeyEvent(event)
    
    for (const shortcut of shortcuts.current) {
      if (shortcut.keys.includes(pressedKey)) {
        if (shortcut.preventDefault) {
          event.preventDefault()
        }
        shortcut.handler()
        break
      }
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, enabled])

  return {
    shortcuts: shortcuts.current,
    enabled
  }
}

/**
 * Format keyboard event to standardized string
 */
function formatKeyEvent(event: KeyboardEvent): string {
  const parts: string[] = []
  
  if (event.ctrlKey || event.metaKey) {
    parts.push(event.ctrlKey ? 'ctrl' : 'cmd')
  }
  if (event.shiftKey) {
    parts.push('shift')
  }
  if (event.altKey) {
    parts.push('alt')
  }
  
  let key = event.key.toLowerCase()
  
  // Special key mappings
  switch (key) {
    case ' ':
      key = 'space'
      break
    case 'arrowup':
      key = 'up'
      break
    case 'arrowdown':
      key = 'down'
      break
    case 'arrowleft':
      key = 'left'
      break
    case 'arrowright':
      key = 'right'
      break
    case '+':
      key = 'plus'
      break
  }
  
  parts.push(key)
  return parts.join('+')
}

/**
 * Mouse interaction utilities for professional feel
 */
export function getInteractionCursor(
  tool: Tool,
  isHovering: boolean,
  isDragging: boolean,
  isPanning: boolean
): string {
  if (isPanning) return 'grabbing'
  if (isDragging) return 'grabbing'
  
  switch (tool) {
    case 'select':
      return isHovering ? 'pointer' : 'default'
    case 'room':
    case 'rectangle':
    case 'circle':
    case 'triangle':
    case 'arc':
      return 'crosshair'
    case 'artwork':
      return 'crosshair'
    case 'door':
    case 'stairs':
    case 'elevator':
      return 'crosshair'
    default:
      return 'default'
  }
}

/**
 * Enhanced zoom utilities with smooth animation
 */
export function calculateSmoothZoom(
  currentZoom: number,
  targetZoom: number,
  mousePos: { x: number; y: number },
  canvasSize: { width: number; height: number },
  currentPan: { x: number; y: number }
): { zoom: number; pan: { x: number; y: number } } {
  const clampedZoom = Math.max(0.1, Math.min(5, targetZoom))
  
  // Calculate new pan to keep mouse position stable
  const worldX = (mousePos.x - currentPan.x) / currentZoom
  const worldY = (mousePos.y - currentPan.y) / currentZoom
  
  const newPanX = mousePos.x - worldX * clampedZoom
  const newPanY = mousePos.y - worldY * clampedZoom
  
  return {
    zoom: clampedZoom,
    pan: { x: newPanX, y: newPanY }
  }
}

/**
 * Touch gesture utilities for tablet/mobile support
 */
export interface TouchGesture {
  type: 'pan' | 'zoom' | 'tap' | 'double-tap'
  startPos: { x: number; y: number }
  currentPos: { x: number; y: number }
  deltaX: number
  deltaY: number
  scale?: number
  fingers: number
}

export function detectTouchGesture(
  touches: TouchList,
  prevTouches?: TouchList
): TouchGesture | null {
  if (touches.length === 1) {
    const touch = touches[0]
    const prevTouch = prevTouches?.[0]
    
    if (prevTouch) {
      return {
        type: 'pan',
        startPos: { x: prevTouch.clientX, y: prevTouch.clientY },
        currentPos: { x: touch.clientX, y: touch.clientY },
        deltaX: touch.clientX - prevTouch.clientX,
        deltaY: touch.clientY - prevTouch.clientY,
        fingers: 1
      }
    }
    
    return {
      type: 'tap',
      startPos: { x: touch.clientX, y: touch.clientY },
      currentPos: { x: touch.clientX, y: touch.clientY },
      deltaX: 0,
      deltaY: 0,
      fingers: 1
    }
  }
  
  if (touches.length === 2 && prevTouches?.length === 2) {
    const [t1, t2] = touches
    const [pt1, pt2] = prevTouches
    
    const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    const prevDistance = Math.hypot(pt2.clientX - pt1.clientX, pt2.clientY - pt1.clientY)
    
    const scale = currentDistance / prevDistance
    const centerX = (t1.clientX + t2.clientX) / 2
    const centerY = (t1.clientY + t2.clientY) / 2
    const prevCenterX = (pt1.clientX + pt2.clientX) / 2
    const prevCenterY = (pt1.clientY + pt2.clientY) / 2
    
    return {
      type: 'zoom',
      startPos: { x: prevCenterX, y: prevCenterY },
      currentPos: { x: centerX, y: centerY },
      deltaX: centerX - prevCenterX,
      deltaY: centerY - prevCenterY,
      scale,
      fingers: 2
    }
  }
  
  return null
}

/**
 * Visual feedback utilities
 */
export function getSnapIndicatorStyle(snapType: 'grid' | 'wall' | 'vertex', isActive: boolean) {
  const base = {
    borderRadius: '50%',
    border: '2px solid',
    background: 'rgba(255, 255, 255, 0.9)',
    transition: 'all 0.15s ease-out',
    transform: isActive ? 'scale(1.2)' : 'scale(1)',
    opacity: isActive ? 1 : 0.7
  }
  
  switch (snapType) {
    case 'grid':
      return { ...base, borderColor: '#3b82f6', width: 8, height: 8 }
    case 'wall':
      return { ...base, borderColor: '#22c55e', width: 10, height: 10 }
    case 'vertex':
      return { ...base, borderColor: '#f59e0b', width: 12, height: 12 }
    default:
      return base
  }
}

/**
 * Animation easing functions
 */
export const Easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
} as const