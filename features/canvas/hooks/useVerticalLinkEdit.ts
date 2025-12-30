/**
 * Hook pour gérer l'édition des vertices de vertical links
 * Permet de déplacer les 4 coins du rectangle
 */

import { useState, useCallback, type MouseEvent } from "react"
import type { Point, EditorState, Floor } from "@/core/entities"
import { snapToGrid } from "@/core/services"
import {
  updateVerticalLinkCorner,
  validateVerticalLinkCornerMove
} from "@/core/services"
import { GRID_SIZE } from "@/core/constants"

interface VerticalLinkEditOptions {
  state: EditorState
  currentFloor: Floor
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, description?: string) => void
  screenToWorld: (x: number, y: number) => Point
}

interface EditState {
  isEditing: boolean
  linkId: string | null
  vertexIndex: number | null
  originalFloors: readonly Floor[] | null
  isValid: boolean
  validationMessage: string | null
}

export function useVerticalLinkEdit({
  state,
  currentFloor,
  updateState,
  screenToWorld
}: VerticalLinkEditOptions) {
  const [editState, setEditState] = useState<EditState>({
    isEditing: false,
    linkId: null,
    vertexIndex: null,
    originalFloors: null,
    isValid: true,
    validationMessage: null
  })

  /**
   * Démarrer l'édition d'un vertex
   */
  const startEdit = useCallback((linkId: string, vertexIndex: number, initialMousePos: Point) => {
    const link = currentFloor.verticalLinks?.find(v => v.id === linkId)
    if (!link) return

    setEditState({
      isEditing: true,
      linkId,
      vertexIndex,
      originalFloors: state.floors,
      isValid: true,
      validationMessage: null
    })
  }, [currentFloor, state.floors])

  /**
   * Mettre à jour la position du vertex
   */
  const updateEdit = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (!editState.isEditing || editState.linkId === null || editState.vertexIndex === null) return

    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snappedPos = snapToGrid(worldPos, GRID_SIZE)

    const link = currentFloor.verticalLinks?.find(v => v.id === editState.linkId)
    if (!link) return

    // Valider le déplacement
    const validation = validateVerticalLinkCornerMove(
      link,
      editState.vertexIndex,
      snappedPos,
      currentFloor
    )

    setEditState(prev => ({
      ...prev,
      isValid: validation.valid,
      validationMessage: validation.message ?? null
    }))

    if (!validation.valid) {
      return
    }

    // Appliquer la transformation
    const updatedLink = updateVerticalLinkCorner(link, editState.vertexIndex, snappedPos)

    const updatedFloors = state.floors.map(floor => {
      if (floor.id !== currentFloor.id) return floor

      return {
        ...floor,
        verticalLinks: floor.verticalLinks?.map(v =>
          v.id === editState.linkId ? updatedLink : v
        )
      }
    })

    updateState({ floors: updatedFloors }, false) // Pas d'historique pendant drag
  }, [editState, state.floors, currentFloor, screenToWorld, updateState])

  /**
   * Terminer l'édition
   */
  const finishEdit = useCallback(() => {
    if (!editState.isEditing || !editState.originalFloors) return

    if (editState.isValid) {
      // Sauvegarder dans l'historique
      updateState({ floors: state.floors }, true, 'Modifier lien vertical')
    } else {
      // Annuler - restaurer l'état original
      updateState({ floors: editState.originalFloors }, false)
    }

    setEditState({
      isEditing: false,
      linkId: null,
      vertexIndex: null,
      originalFloors: null,
      isValid: true,
      validationMessage: null
    })
  }, [editState, state.floors, updateState])

  /**
   * Annuler l'édition
   */
  const cancelEdit = useCallback(() => {
    if (!editState.isEditing || !editState.originalFloors) return

    // Restaurer l'état original
    updateState({ floors: editState.originalFloors }, false)

    setEditState({
      isEditing: false,
      linkId: null,
      vertexIndex: null,
      originalFloors: null,
      isValid: true,
      validationMessage: null
    })
  }, [editState, updateState])

  return {
    editState: {
      isEditing: editState.isEditing,
      isValid: editState.isValid,
      validationMessage: editState.validationMessage
    },
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit
  }
}
