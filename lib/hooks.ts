import { useCallback, useRef, useState } from 'react'
import { RENDER_CONFIG } from './constants'

interface RenderLayer {
  name: string
  zIndex: number
  dirty: boolean
  lastRender: number
}

interface UseRenderOptimizationReturn {
  isDirty: boolean
  markDirty: (layer?: string) => void
  markClean: () => void
  shouldRender: () => boolean
  renderLayers: Map<string, RenderLayer>
  markLayerDirty: (layerName: string) => void
  isLayerDirty: (layerName: string) => boolean
}

/**
 * Custom hook for optimizing canvas rendering with dirty flags and layer management
 */
export function useRenderOptimization(layers: string[] = ['grid', 'rooms', 'elements', 'ui']): UseRenderOptimizationReturn {
  const [isDirty, setIsDirty] = useState(true)
  const lastRenderTime = useRef(0)
  const renderLayersRef = useRef(new Map<string, RenderLayer>())

  // Initialize layers
  if (renderLayersRef.current.size === 0) {
    layers.forEach((name, index) => {
      renderLayersRef.current.set(name, {
        name,
        zIndex: index,
        dirty: true,
        lastRender: 0,
      })
    })
  }

  const markDirty = useCallback((layer?: string) => {
    if (layer) {
      const layerData = renderLayersRef.current.get(layer)
      if (layerData) {
        renderLayersRef.current.set(layer, { ...layerData, dirty: true })
      }
    }
    setIsDirty(true)
  }, [])

  const markClean = useCallback(() => {
    const now = performance.now()
    renderLayersRef.current.forEach((layer, name) => {
      renderLayersRef.current.set(name, { ...layer, dirty: false, lastRender: now })
    })
    lastRenderTime.current = now
    setIsDirty(false)
  }, [])

  const shouldRender = useCallback(() => {
    if (!RENDER_CONFIG.dirtyFlagOptimization) return true
    
    const now = performance.now()
    const timeSinceLastRender = now - lastRenderTime.current
    
    return isDirty && timeSinceLastRender >= RENDER_CONFIG.renderThrottleMs
  }, [isDirty])

  const markLayerDirty = useCallback((layerName: string) => {
    const layer = renderLayersRef.current.get(layerName)
    if (layer) {
      renderLayersRef.current.set(layerName, { ...layer, dirty: true })
      setIsDirty(true)
    }
  }, [])

  const isLayerDirty = useCallback((layerName: string) => {
    return renderLayersRef.current.get(layerName)?.dirty ?? true
  }, [])

  return {
    isDirty,
    markDirty,
    markClean,
    shouldRender,
    renderLayers: renderLayersRef.current,
    markLayerDirty,
    isLayerDirty,
  }
}

/**
 * Throttle function calls to improve performance
 */
export function useThrottle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastCallTime = useRef(0)

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now()
    
    if (now - lastCallTime.current >= delay) {
      lastCallTime.current = now
      return func(...args)
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      timeoutRef.current = setTimeout(() => {
        lastCallTime.current = Date.now()
        func(...args)
        timeoutRef.current = null
      }, delay - (now - lastCallTime.current))
    }
  }, [func, delay]) as T
}

/**
 * Debounce function calls
 */
export function useDebounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      func(...args)
      timeoutRef.current = null
    }, delay)
  }, [func, delay]) as T
}

/**
 * Memoize expensive calculations
 */
export function useMemoizedCalculation<T>(
  calculation: () => T,
  dependencies: readonly unknown[]
): T {
  const memoRef = useRef<{ deps: readonly unknown[]; result: T } | null>(null)

  const hasChanged = !memoRef.current || 
    dependencies.length !== memoRef.current.deps.length ||
    dependencies.some((dep, index) => dep !== memoRef.current!.deps[index])

  if (hasChanged) {
    memoRef.current = {
      deps: dependencies,
      result: calculation()
    }
  }

  return memoRef.current!.result
}