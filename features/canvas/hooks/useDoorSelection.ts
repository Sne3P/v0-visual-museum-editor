/**
 * HOOK SÉLECTION ET MANIPULATION DE PORTES
 * Permet de sélectionner, déplacer et redimensionner les portes
 */

import { useState, useCallback, type MouseEvent } from 'react'
import type { Point, Floor, Door } from '@/core/entities'
import { distance, snapToGrid } from '@/core/services'
import { validateDoorPlacement, type SharedWallSegment } from '@/core/services'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'

export interface DoorSelectionState {
  readonly selectedDoor: Door | null
  readonly editMode: 'move' | 'resize-start' | 'resize-end' | null
  readonly isDragging: boolean
  readonly startPoint: Point | null
  readonly previewDoor: Door | null
  readonly isValid: boolean
  readonly validationMessage: string | null
}

interface UseDoorSelectionProps {
  readonly currentFloor: Floor
  readonly onUpdate: (door: Door) => void
}

interface UseDoorSelectionReturn {
  readonly state: DoorSelectionState
  readonly selectDoor: (doorId: string, point: Point) => void
  readonly startDrag: (point: Point) => void
  readonly updateDrag: (point: Point) => void
  readonly completeDrag: () => void
  readonly cancelDrag: () => void
  readonly deselectDoor: () => void
}

const HANDLE_RADIUS = 12 // Rayon de détection pour les poignées en pixels

export function useDoorSelection({
  currentFloor,
  onUpdate
}: UseDoorSelectionProps): UseDoorSelectionReturn {
  
  const [state, setState] = useState<DoorSelectionState>({
    selectedDoor: null,
    editMode: null,
    isDragging: false,
    startPoint: null,
    previewDoor: null,
    isValid: true,
    validationMessage: null
  })

  /**
   * Sélectionne une porte et détermine le mode d'édition selon le point cliqué
   */
  const selectDoor = useCallback((doorId: string, point: Point) => {
    const door = currentFloor.doors.find(d => d.id === doorId)
    if (!door) return

    // Les doors sont déjà en pixels
    const startPixels = {
      x: door.segment[0].x,
      y: door.segment[0].y
    }
    const endPixels = {
      x: door.segment[1].x,
      y: door.segment[1].y
    }

    // Vérifier quelle partie est cliquée
    const distToStart = distance(point, startPixels)
    const distToEnd = distance(point, endPixels)

    let editMode: 'move' | 'resize-start' | 'resize-end' = 'move'

    if (distToStart < HANDLE_RADIUS) {
      editMode = 'resize-start'
    } else if (distToEnd < HANDLE_RADIUS) {
      editMode = 'resize-end'
    }

    setState({
      selectedDoor: door,
      editMode,
      isDragging: false,
      startPoint: null,
      previewDoor: null,
      isValid: true,
      validationMessage: null
    })
  }, [currentFloor])

  /**
   * Commence le drag
   */
  const startDrag = useCallback((point: Point) => {
    if (!state.selectedDoor) return

    setState(prev => ({
      ...prev,
      isDragging: true,
      startPoint: point,
      previewDoor: prev.selectedDoor
    }))
  }, [state.selectedDoor])

  /**
   * Met à jour pendant le drag
   */
  const updateDrag = useCallback((point: Point) => {
    if (!state.isDragging || !state.selectedDoor || !state.startPoint) return

    // Ne pas snapper ici - le snap sera fait dans translateDoorAlongSegment/resizeDoor
    const door = state.selectedDoor

    // Trouver le mur partagé pour cette porte
    const { findSharedWallSegments } = require('@/core/services/door.service')
    const sharedWalls: SharedWallSegment[] = findSharedWallSegments(currentFloor)
    const sharedWall = sharedWalls.find(w => 
      (w.room_a === door.room_a && w.room_b === door.room_b) ||
      (w.room_a === door.room_b && w.room_b === door.room_a)
    )

    if (!sharedWall) {
      setState(prev => ({
        ...prev,
        isValid: false,
        validationMessage: "Mur partagé introuvable"
      }))
      return
    }

    let newDoor: Door | null = null

    if (state.editMode === 'move') {
      // Translation le long du segment
      newDoor = translateDoorAlongSegment(door, point, sharedWall.segment)
    } else if (state.editMode === 'resize-start' || state.editMode === 'resize-end') {
      // Redimensionnement
      newDoor = resizeDoor(door, point, state.editMode, sharedWall.segment)
    }

    if (!newDoor) {
      setState(prev => ({
        ...prev,
        previewDoor: null,
        isValid: false,
        validationMessage: "Position invalide"
      }))
      return
    }

    // Valider
    const validation = validateDoorPlacement(newDoor, currentFloor)

    setState(prev => ({
      ...prev,
      previewDoor: newDoor,
      isValid: validation.valid,
      validationMessage: validation.message || null
    }))
  }, [state.isDragging, state.selectedDoor, state.startPoint, state.editMode, currentFloor])

  /**
   * Termine le drag
   */
  const completeDrag = useCallback(() => {
    if (!state.isDragging || !state.previewDoor || !state.isValid) {
      setState(prev => ({
        ...prev,
        isDragging: false,
        startPoint: null,
        previewDoor: null
      }))
      return
    }

    // Appeler onUpdate avec la porte modifiée
    onUpdate(state.previewDoor)

    setState(prev => ({
      ...prev,
      selectedDoor: state.previewDoor,
      isDragging: false,
      startPoint: null,
      previewDoor: null,
      isValid: true,
      validationMessage: null
    }))
  }, [state.isDragging, state.previewDoor, state.isValid, onUpdate])

  /**
   * Annule le drag
   */
  const cancelDrag = useCallback(() => {
    setState(prev => ({
      ...prev,
      isDragging: false,
      startPoint: null,
      previewDoor: null,
      isValid: true,
      validationMessage: null
    }))
  }, [])

  /**
   * Désélectionne la porte
   */
  const deselectDoor = useCallback(() => {
    setState({
      selectedDoor: null,
      editMode: null,
      isDragging: false,
      startPoint: null,
      previewDoor: null,
      isValid: true,
      validationMessage: null
    })
  }, [])

  return {
    state,
    selectDoor,
    startDrag,
    updateDrag,
    completeDrag,
    cancelDrag,
    deselectDoor
  }
}

/**
 * Translate une porte le long de son segment
 */
function translateDoorAlongSegment(
  door: Door,
  targetPoint: Point,
  wallSegment: readonly [Point, Point]
): Door | null {
  // wallSegment et door.segment sont déjà en pixels
  const wallStart = {
    x: wallSegment[0].x,
    y: wallSegment[0].y
  }
  const wallEnd = {
    x: wallSegment[1].x,
    y: wallSegment[1].y
  }

  // Projeter le point cible (en pixels) sur le segment du mur (en pixels)
  const projectedPoint = projectPointOntoSegment(targetPoint, wallStart, wallEnd)

  // Calculer le vecteur direction du mur
  const dx = wallEnd.x - wallStart.x
  const dy = wallEnd.y - wallStart.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.01) return null

  const ux = dx / length
  const uy = dy / length

  // Demi-largeur de la porte en pixels (door.width en mètres, 0.5m = 40px)
  const halfWidth = (door.width * 80) / 2

  // Nouveaux points de la porte en pixels
  const newStartPixels = {
    x: projectedPoint.x - ux * halfWidth,
    y: projectedPoint.y - uy * halfWidth
  }

  const newEndPixels = {
    x: projectedPoint.x + ux * halfWidth,
    y: projectedPoint.y + uy * halfWidth
  }

  // Garder en pixels, snapper légèrement
  const newStart: Point = snapToGrid({
    x: newStartPixels.x,
    y: newStartPixels.y
  }, 1)

  const newEnd: Point = snapToGrid({
    x: newEndPixels.x,
    y: newEndPixels.y
  }, 1)

  return {
    ...door,
    segment: [newStart, newEnd]
  }
}

/**
 * Redimensionne une porte en déplaçant une extrémité
 */
function resizeDoor(
  door: Door,
  targetPoint: Point,
  mode: 'resize-start' | 'resize-end',
  wallSegment: readonly [Point, Point]
): Door | null {
  // wallSegment est en unités de grille, convertir en pixels
  const wallStart = {
    x: wallSegment[0].x * GRID_SIZE,
    y: wallSegment[0].y * GRID_SIZE
  }
  const wallEnd = {
    x: wallSegment[1].x * GRID_SIZE,
    y: wallSegment[1].y * GRID_SIZE
  }

  // Projeter le point cible (en pixels) sur le segment du mur (en pixels)
  const projectedPoint = projectPointOntoSegment(targetPoint, wallStart, wallEnd)

  // Point fixe (l'autre extrémité) en pixels
  const fixedPointGrid = mode === 'resize-start' ? door.segment[1] : door.segment[0]
  const fixedPointPixels = {
    x: fixedPointGrid.x * GRID_SIZE,
    y: fixedPointGrid.y * GRID_SIZE
  }

  // Calculer nouvelle largeur en pixels
  const newWidthPixels = distance(fixedPointPixels, projectedPoint)
  const newWidthMeters = (newWidthPixels / GRID_SIZE) * 0.5

  // Vérifier contraintes de largeur
  if (newWidthMeters < CONSTRAINTS.door.minWidth || newWidthMeters > CONSTRAINTS.door.maxWidth) {
    return null
  }

  // Convertir le point mobile en unités de grille et snapper
  const newMovingPoint: Point = snapToGrid({
    x: projectedPoint.x / GRID_SIZE,
    y: projectedPoint.y / GRID_SIZE
  }, 1)

  const newSegment: readonly [Point, Point] = mode === 'resize-start'
    ? [newMovingPoint, fixedPointGrid]
    : [fixedPointGrid, newMovingPoint]

  return {
    ...door,
    segment: newSegment,
    width: newWidthMeters
  }
}

/**
 * Projette un point sur un segment (clamped)
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
