/**
 * HOOK CRÉATION DE PORTE
 * Gestion de la création interactive de portes sur les murs partagés
 */

import { useState, useCallback } from 'react'
import type { Point, Floor, Door } from '@/core/entities'
import {
  findSharedWallSegments,
  findPossibleDoorPositions,
  createDoor,
  validateDoorPlacement,
  type SharedWallSegment,
  type DoorPosition
} from '@/core/services'
import { distance, snapToGrid } from '@/core/services'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'
import { v4 as uuidv4 } from 'uuid'

export interface DoorCreationState {
  readonly isCreating: boolean
  readonly startPoint: Point | null
  readonly currentPoint: Point | null
  readonly previewDoor: Door | null
  readonly selectedWall: SharedWallSegment | null
  readonly possiblePositions: DoorPosition[]
  readonly hoveredPosition: DoorPosition | null
  readonly validationMessage: string | null
  readonly isValid: boolean
}

interface UseDoorCreationProps {
  readonly currentFloor: Floor
  readonly onComplete: (door: Door) => void
}

interface UseDoorCreationReturn {
  readonly state: DoorCreationState
  readonly sharedWalls: SharedWallSegment[]
  readonly startCreation: (point: Point) => void
  readonly updateCreation: (point: Point) => void
  readonly completeCreation: () => void
  readonly cancelCreation: () => void
  readonly selectWallAtPoint: (point: Point) => SharedWallSegment | null
  readonly findNearestDoorPosition: (point: Point) => DoorPosition | null
}

const DEFAULT_DOOR_WIDTH = 0.9 // 90cm (largeur standard)

export function useDoorCreation({
  currentFloor,
  onComplete
}: UseDoorCreationProps): UseDoorCreationReturn {
  
  const [state, setState] = useState<DoorCreationState>({
    isCreating: false,
    startPoint: null,
    currentPoint: null,
    previewDoor: null,
    selectedWall: null,
    possiblePositions: [],
    hoveredPosition: null,
    validationMessage: null,
    isValid: false
  })

  // Calculer les murs partagés et positions possibles
  const sharedWalls = findSharedWallSegments(currentFloor)
  const possiblePositions = findPossibleDoorPositions(currentFloor)

  /**
   * Sélectionne le mur partagé le plus proche du point cliqué
   */
  const selectWallAtPoint = useCallback((point: Point): SharedWallSegment | null => {
    const snappedPoint = snapToGrid(point, GRID_SIZE)
    let closestWall: SharedWallSegment | null = null
    let minDistance = Infinity

    for (const wall of sharedWalls) {
      const [start, end] = wall.segment
      const dist = distanceToSegment(snappedPoint, start, end)
      
      if (dist < minDistance && dist < GRID_SIZE * 2) { // Tolérance de 2 unités de grille
        minDistance = dist
        closestWall = wall
      }
    }

    return closestWall
  }, [sharedWalls])

  /**
   * Trouve la position de porte la plus proche
   */
  const findNearestDoorPosition = useCallback((point: Point): DoorPosition | null => {
    const snappedPoint = snapToGrid(point, GRID_SIZE)
    let nearest: DoorPosition | null = null
    let minDist = Infinity

    for (const pos of possiblePositions) {
      const dist = distance(snappedPoint, pos.center)
      if (dist < minDist && dist < GRID_SIZE * 3) {
        minDist = dist
        nearest = pos
      }
    }

    return nearest
  }, [possiblePositions])

  /**
   * Commence la création d'une porte
   */
  const startCreation = useCallback((point: Point) => {
    const snappedPoint = snapToGrid(point, GRID_SIZE)
    const wall = selectWallAtPoint(snappedPoint)

    if (!wall) {
      setState(prev => ({
        ...prev,
        validationMessage: "Cliquez sur un mur partagé entre deux pièces",
        isValid: false
      }))
      return
    }

    setState(prev => ({
      ...prev,
      isCreating: true,
      startPoint: snappedPoint,
      currentPoint: snappedPoint,
      selectedWall: wall,
      possiblePositions,
      validationMessage: "Glissez pour définir la largeur de la porte",
      isValid: false
    }))
  }, [selectWallAtPoint, possiblePositions])

  /**
   * Met à jour la création pendant le drag
   */
  const updateCreation = useCallback((point: Point) => {
    if (!state.isCreating || !state.selectedWall || !state.startPoint) return

    const snappedPoint = snapToGrid(point, GRID_SIZE)
    
    // Projeter les deux points (start et current) sur le segment du mur
    const [wallStart, wallEnd] = state.selectedWall.segment
    const projectedStart = projectPointOntoSegment(state.startPoint, wallStart, wallEnd)
    const projectedEnd = projectPointOntoSegment(snappedPoint, wallStart, wallEnd)
    
    // Calculer largeur en pixels puis convertir en mètres
    // Formule: 40 pixels = 0.5m donc pixels * 0.5 / 40 = pixels / 80
    const doorWidthPixels = distance(projectedStart, projectedEnd)
    const doorWidthMeters = doorWidthPixels / 80
    
    // Vérifier si la largeur est suffisante pour créer la porte
    if (doorWidthMeters < CONSTRAINTS.door.minWidth) {
      setState(prev => ({
        ...prev,
        currentPoint: snappedPoint,
        previewDoor: null,
        isValid: false,
        validationMessage: `Glissez plus loin (min: ${CONSTRAINTS.door.minWidth}m, actuel: ${doorWidthMeters.toFixed(2)}m)`
      }))
      return
    }
    
    // Clamper entre min et max pour la création effective
    const doorWidth = Math.min(CONSTRAINTS.door.maxWidth, doorWidthMeters)

    // Convertir mètres -> pixels : mètres * 80 (car 0.5m = 40px)
    const halfWidth = (doorWidth * 80) / 2
    const dx = wallEnd.x - wallStart.x
    const dy = wallEnd.y - wallStart.y
    const length = Math.sqrt(dx * dx + dy * dy)
    
    if (length < 0.01) return
    
    const ux = dx / length
    const uy = dy / length
    
    // Centre de la porte = milieu entre les deux projections
    const centerX = (projectedStart.x + projectedEnd.x) / 2
    const centerY = (projectedStart.y + projectedEnd.y) / 2
    
    // Points de la porte EN PIXELS (garder tel quel)
    const doorStart: Point = {
      x: Math.round(centerX - ux * halfWidth),
      y: Math.round(centerY - uy * halfWidth)
    }
    
    const doorEnd: Point = {
      x: Math.round(centerX + ux * halfWidth),
      y: Math.round(centerY + uy * halfWidth)
    }

    // Créer la preview de porte
    const previewDoor: Door = {
      id: 'preview',
      room_a: state.selectedWall.room_a,
      room_b: state.selectedWall.room_b,
      segment: [doorStart, doorEnd],
      width: doorWidth,
      roomId: state.selectedWall.wallId
    }

    // Valider
    let isValid = true
    let validationMessage = `Porte ${doorWidthMeters.toFixed(2)}m`
    
    if (doorWidthMeters > CONSTRAINTS.door.maxWidth) {
      isValid = false
      validationMessage = `Trop large (max: ${CONSTRAINTS.door.maxWidth}m)`
    } else {
      // Si largeur OK, valider le placement
      const result = validateDoorPlacement(previewDoor, currentFloor)
      isValid = result.valid
      if (!result.valid && result.message) {
        validationMessage = result.message
      }
    }

    setState(prev => ({
      ...prev,
      currentPoint: snappedPoint,
      previewDoor,
      isValid,
      validationMessage
    }))
  }, [state.isCreating, state.selectedWall, state.startPoint, currentFloor])

  /**
   * Termine la création de la porte
   */
  const completeCreation = useCallback(() => {
    if (!state.isCreating) {
      return
    }

    // Si pas de preview ou invalide, juste annuler
    if (!state.previewDoor || !state.isValid) {
      setState({
        isCreating: false,
        startPoint: null,
        currentPoint: null,
        previewDoor: null,
        selectedWall: null,
        possiblePositions: [],
        hoveredPosition: null,
        validationMessage: null,
        isValid: false
      })
      return
    }

    // Créer la porte finale avec un vrai ID
    const finalDoor: Door = {
      ...state.previewDoor,
      id: uuidv4()
    }
    
    // Appeler onComplete pour ajouter la porte au floor
    onComplete(finalDoor)

    // Réinitialiser
    setState({
      isCreating: false,
      startPoint: null,
      currentPoint: null,
      previewDoor: null,
      selectedWall: null,
      possiblePositions: [],
      hoveredPosition: null,
      validationMessage: null,
      isValid: false
    })
  }, [state.isCreating, state.previewDoor, state.isValid, onComplete])

  /**
   * Annule la création
   */
  const cancelCreation = useCallback(() => {
    setState({
      isCreating: false,
      startPoint: null,
      currentPoint: null,
      previewDoor: null,
      selectedWall: null,
      possiblePositions: [],
      hoveredPosition: null,
      validationMessage: null,
      isValid: false
    })
  }, [])

  return {
    state,
    sharedWalls,
    startCreation,
    updateCreation,
    completeCreation,
    cancelCreation,
    selectWallAtPoint,
    findNearestDoorPosition
  }
}

/**
 * Calcule la distance d'un point à un segment
 */
function distanceToSegment(point: Point, segStart: Point, segEnd: Point): number {
  const projected = projectPointOntoSegment(point, segStart, segEnd)
  return distance(point, projected)
}

/**
 * Projette un point sur un segment (clamped entre start et end)
 */
function projectPointOntoSegment(point: Point, segStart: Point, segEnd: Point): Point {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared < 0.0001) {
    return { ...segStart }
  }

  const t = Math.max(0, Math.min(1,
    ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared
  ))

  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy
  }
}
