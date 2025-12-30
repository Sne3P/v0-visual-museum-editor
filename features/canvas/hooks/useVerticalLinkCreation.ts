/**
 * Hook pour créer des liens verticaux (escaliers/ascenseurs)
 * - Tracé par drag simple (crée un rectangle)
 * - Validation en temps réel
 * - Ouvre modal de sélection d'étages à la fin
 */

import { useState, useCallback } from 'react'
import type { Point, Floor } from '@/core/entities'
import { snapToGrid, distance } from '@/core/services'
import { validateVerticalLinkCreation } from '@/core/services'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'

export interface VerticalLinkCreationState {
  isCreating: boolean
  startPoint: Point | null
  currentPoint: Point | null
  isValid: boolean
  validationMessage: string | null
  validationSeverity: 'error' | 'warning' | 'info' | null
  type: 'stairs' | 'elevator' | null
}

interface UseVerticalLinkCreationProps {
  currentFloor: Floor
  onComplete: (position: Point, size: readonly [number, number], type: 'stairs' | 'elevator') => void
}

export function useVerticalLinkCreation({ currentFloor, onComplete }: UseVerticalLinkCreationProps) {
  const [state, setState] = useState<VerticalLinkCreationState>({
    isCreating: false,
    startPoint: null,
    currentPoint: null,
    isValid: true,
    validationMessage: null,
    validationSeverity: null,
    type: null
  })

  /**
   * Démarre la création
   */
  const startCreation = useCallback((point: Point, type: 'stairs' | 'elevator') => {
    const snapped = snapToGrid(point, GRID_SIZE)
    setState({
      isCreating: true,
      startPoint: snapped,
      currentPoint: snapped,
      isValid: true,
      validationMessage: null,
      validationSeverity: null,
      type
    })
  }, [])

  /**
   * Met à jour la position courante (drag)
   */
  const updateCurrentPoint = useCallback((point: Point) => {
    if (!state.isCreating || !state.startPoint || !state.type) return

    const snapped = snapToGrid(point, GRID_SIZE)
    
    // Calculer position et taille du rectangle
    const minX = Math.min(state.startPoint.x, snapped.x)
    const maxX = Math.max(state.startPoint.x, snapped.x)
    const minY = Math.min(state.startPoint.y, snapped.y)
    const maxY = Math.max(state.startPoint.y, snapped.y)
    
    const width = maxX - minX
    const height = maxY - minY
    
    // Vérifier taille minimale
    if (width < CONSTRAINTS.verticalLink.minSize[0] || height < CONSTRAINTS.verticalLink.minSize[1]) {
      setState(prev => ({ 
        ...prev, 
        currentPoint: snapped,
        isValid: false,
        validationMessage: `Taille minimale: ${CONSTRAINTS.verticalLink.minSize[0]}m x ${CONSTRAINTS.verticalLink.minSize[1]}m`,
        validationSeverity: 'warning'
      }))
      return
    }
    
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    
    // Valider
    const validation = validateVerticalLinkCreation(
      { x: centerX, y: centerY },
      [width, height] as const,
      state.type,
      currentFloor
    )
    
    setState(prev => ({
      ...prev,
      currentPoint: snapped,
      isValid: validation.valid,
      validationMessage: validation.message,
      validationSeverity: validation.severity || null
    }))
  }, [state.isCreating, state.startPoint, state.type, currentFloor])

  /**
   * Termine la création
   */
  const finishCreation = useCallback(() => {
    if (!state.isCreating || !state.startPoint || !state.currentPoint || !state.type || !state.isValid) {
      cancelCreation()
      return
    }

    // Calculer position et taille finales
    const minX = Math.min(state.startPoint.x, state.currentPoint.x)
    const maxX = Math.max(state.startPoint.x, state.currentPoint.x)
    const minY = Math.min(state.startPoint.y, state.currentPoint.y)
    const maxY = Math.max(state.startPoint.y, state.currentPoint.y)
    
    const width = maxX - minX
    const height = maxY - minY
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    
    // Validation finale
    const validation = validateVerticalLinkCreation(
      { x: centerX, y: centerY },
      [width, height] as const,
      state.type,
      currentFloor
    )
    
    if (!validation.valid) {
      cancelCreation()
      return
    }

    // Compléter avec le callback (qui ouvrira le modal)
    onComplete({ x: centerX, y: centerY }, [width, height] as const, state.type)

    // Réinitialiser
    setState({
      isCreating: false,
      startPoint: null,
      currentPoint: null,
      isValid: true,
      validationMessage: null,
      validationSeverity: null,
      type: null
    })
  }, [state.isCreating, state.startPoint, state.currentPoint, state.type, state.isValid, currentFloor, onComplete])

  /**
   * Annule la création
   */
  const cancelCreation = useCallback(() => {
    setState({
      isCreating: false,
      startPoint: null,
      currentPoint: null,
      isValid: true,
      validationMessage: null,
      validationSeverity: null,
      type: null
    })
  }, [])

  return {
    state,
    startCreation,
    updateCurrentPoint,
    finishCreation,
    cancelCreation
  }
}
