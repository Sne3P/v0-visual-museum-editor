/**
 * Hook pour gérer la création de formes avec validation en temps réel
 * - Gère le drag pour créer des formes géométriques
 * - Valide en temps réel pendant le tracé
 * - Génère des prévisualisations avec feedback visuel
 */

import { useState, useCallback } from 'react'
import type { Point, Room, Floor, Tool } from '@/core/entities'
import { 
  snapToGrid, 
  createCirclePolygon, 
  createTrianglePolygon, 
  createArcPolygon,
  distance 
} from '@/core/services'
import { validateRoomGeometry } from '@/core/services'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'

export interface ShapeCreationState {
  isCreating: boolean
  startPoint: Point | null
  currentPoint: Point | null
  previewPolygon: Point[] | null
  isValid: boolean
  validationMessage: string | null
  validationSeverity: 'error' | 'warning' | 'info' | null
}

interface UseShapeCreationProps {
  tool: Tool
  currentFloor: Floor
  onComplete: (polygon: Point[]) => void
}

export function useShapeCreation({ tool, currentFloor, onComplete }: UseShapeCreationProps) {
  const [state, setState] = useState<ShapeCreationState>({
    isCreating: false,
    startPoint: null,
    currentPoint: null,
    previewPolygon: null,
    isValid: true,
    validationMessage: null,
    validationSeverity: null
  })

  /**
   * Démarre la création d'une forme
   */
  const startCreation = useCallback((point: Point) => {
    const snapped = snapToGrid(point, GRID_SIZE)
    setState({
      isCreating: true,
      startPoint: snapped,
      currentPoint: snapped,
      previewPolygon: null,
      isValid: true,
      validationMessage: null,
      validationSeverity: null
    })
  }, [])

  /**
   * Met à jour la prévisualisation pendant le drag
   */
  const updateCreation = useCallback((point: Point) => {
    if (!state.startPoint) return

    const snapped = snapToGrid(point, GRID_SIZE)
    
    // Vérifier distance minimum
    const dragDistance = distance(snapped, state.startPoint)
    if (dragDistance < CONSTRAINTS.creation.minDragDistance) {
      setState(prev => ({
        ...prev,
        currentPoint: snapped,
        previewPolygon: null,
        isValid: false,
        validationMessage: 'Distance trop courte',
        validationSeverity: 'warning'
      }))
      return
    }

    // Générer le polygone selon l'outil
    let polygon: Point[] = []
    
    switch (tool) {
      case 'rectangle':
        polygon = [
          state.startPoint,
          { x: snapped.x, y: state.startPoint.y },
          snapped,
          { x: state.startPoint.x, y: snapped.y }
        ]
        break
        
      case 'circle': {
        const radius = Math.max(
          Math.abs(snapped.x - state.startPoint.x),
          Math.abs(snapped.y - state.startPoint.y)
        )
        polygon = createCirclePolygon(state.startPoint, radius, GRID_SIZE)
        break
      }
      
      case 'triangle':
        polygon = createTrianglePolygon(state.startPoint, snapped, GRID_SIZE)
        break
        
      case 'arc': {
        const startPoint = { 
          x: state.startPoint.x + (snapped.x - state.startPoint.x), 
          y: state.startPoint.y 
        }
        polygon = createArcPolygon(state.startPoint, startPoint, snapped, GRID_SIZE)
        break
      }
      
      case 'wall':
      case 'door':
      case 'stairs':
      case 'elevator':
        polygon = [state.startPoint, snapped]
        break
        
      default:
        polygon = []
    }

    // Valider la forme
    let isValid = true
    let validationMessage: string | null = null
    let validationSeverity: 'error' | 'warning' | 'info' | null = null

    if (polygon.length >= 3 && ['rectangle', 'circle', 'triangle', 'arc'].includes(tool)) {
      const tempRoom: Room = {
        id: 'preview',
        polygon: polygon
      }
      
      const validation = validateRoomGeometry(tempRoom, {
        floor: currentFloor,
        strictMode: false,
        allowWarnings: true
      })

      isValid = validation.valid || validation.severity !== 'error'
      validationMessage = validation.message || null
      validationSeverity = validation.severity
    }

    setState(prev => ({
      ...prev,
      currentPoint: snapped,
      previewPolygon: polygon,
      isValid,
      validationMessage,
      validationSeverity
    }))
  }, [state.startPoint, tool, currentFloor])

  /**
   * Termine la création et valide la forme finale
   */
  const finishCreation = useCallback(() => {
    if (!state.previewPolygon || !state.isValid) {
      // Annuler si pas de polygone ou invalide
      setState({
        isCreating: false,
        startPoint: null,
        currentPoint: null,
        previewPolygon: null,
        isValid: true,
        validationMessage: null,
        validationSeverity: null
      })
      return
    }

    // Compléter la création
    onComplete(state.previewPolygon)

    // Réinitialiser l'état
    setState({
      isCreating: false,
      startPoint: null,
      currentPoint: null,
      previewPolygon: null,
      isValid: true,
      validationMessage: null,
      validationSeverity: null
    })
  }, [state.previewPolygon, state.isValid, onComplete])

  /**
   * Annule la création en cours
   */
  const cancelCreation = useCallback(() => {
    setState({
      isCreating: false,
      startPoint: null,
      currentPoint: null,
      previewPolygon: null,
      isValid: true,
      validationMessage: null,
      validationSeverity: null
    })
  }, [])

  return {
    state,
    startCreation,
    updateCreation,
    finishCreation,
    cancelCreation
  }
}
