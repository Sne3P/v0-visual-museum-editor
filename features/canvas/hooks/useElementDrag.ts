/**
 * Hook pour gérer le déplacement (drag) d'éléments sélectionnés
 * Supporte : rooms, walls, doors, artworks, verticalLinks
 * Validation temps réel pendant le déplacement
 */

import { useState, useCallback, type MouseEvent } from "react"
import type { Point, EditorState, Floor, SelectedElement, Room } from "@/core/entities"
import {
  translateRoom,
  translateWall,
  translateDoor,
  translateArtwork,
  translateVerticalLink,
  calculateDelta
} from "@/core/services"
import { snapToGrid } from "@/core/services"
import { validateRoomGeometry } from "@/core/services"
import { GRID_SIZE } from "@/core/constants"

interface ElementDragOptions {
  state: EditorState
  currentFloor: Floor
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, description?: string) => void
  screenToWorld: (x: number, y: number) => Point
}

interface DragState {
  isDragging: boolean
  draggedElements: SelectedElement[]
  startPosition: Point | null
  currentPosition: Point | null
  originalElements: Map<string, any>
  isValid: boolean
  validationMessage: string | null
}

export function useElementDrag({
  state,
  currentFloor,
  updateState,
  screenToWorld
}: ElementDragOptions) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedElements: [],
    startPosition: null,
    currentPosition: null,
    originalElements: new Map(),
    isValid: true,
    validationMessage: null
  })

  /**
   * Démarrer le drag d'éléments sélectionnés
   */
  const startDrag = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (state.selectedElements.length === 0) return
    
    // Ne pas déplacer les vertices/segments individuels (c'est pour useVertexEdit)
    const hasSubElements = state.selectedElements.some(
      el => el.type === 'vertex' || el.type === 'segment'
    )
    if (hasSubElements) return

    const worldPos = screenToWorld(e.clientX, e.clientY)
    // IMPORTANT: Snap la position de départ pour garantir un déplacement aligné sur grille
    const snappedStartPos = snapToGrid(worldPos, GRID_SIZE)
    
    // Sauvegarder les éléments originaux
    const originalElements = new Map()
    
    state.selectedElements.forEach(selected => {
      let element = null
      
      switch (selected.type) {
        case 'room':
          element = currentFloor.rooms.find(r => r.id === selected.id)
          break
        case 'wall':
          element = currentFloor.walls?.find(w => w.id === selected.id)
          break
        case 'door':
          element = currentFloor.doors?.find(d => d.id === selected.id)
          break
        case 'artwork':
          element = currentFloor.artworks?.find(a => a.id === selected.id)
          break
        case 'verticalLink':
          element = currentFloor.verticalLinks?.find(v => v.id === selected.id)
          break
      }
      
      if (element) {
        originalElements.set(selected.id, JSON.parse(JSON.stringify(element)))
      }
    })
    
    setDragState({
      isDragging: true,
      draggedElements: [...state.selectedElements],
      startPosition: snappedStartPos,  // Position snappée
      currentPosition: snappedStartPos, // Position snappée
      originalElements,
      isValid: true,
      validationMessage: null
    })
  }, [state.selectedElements, currentFloor, screenToWorld])

  /**
   * Mettre à jour la position pendant le drag
   */
  const updateDrag = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (!dragState.isDragging || !dragState.startPosition) return

    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snappedPos = snapToGrid(worldPos, GRID_SIZE)
    
    // Calculer le delta
    const delta = calculateDelta(dragState.startPosition, snappedPos)
    
    console.log('🎯 Element Drag Update:', {
      worldPos,
      snappedPos,
      startPosition: dragState.startPosition,
      delta,
      gridSize: GRID_SIZE
    })
    
    // Créer les nouveaux éléments
    const updatedFloors = state.floors.map(floor => {
      if (floor.id !== currentFloor.id) return floor
      
      let newRooms = [...floor.rooms]
      let newWalls = floor.walls ? [...floor.walls] : []
      let newDoors = floor.doors ? [...floor.doors] : []
      let newArtworks = floor.artworks ? [...floor.artworks] : []
      let newVerticalLinks = floor.verticalLinks ? [...floor.verticalLinks] : []
      
      // Appliquer la transformation à chaque élément
      dragState.draggedElements.forEach(selected => {
        const original = dragState.originalElements.get(selected.id)
        if (!original) return
        
        switch (selected.type) {
          case 'room':
            const roomIndex = newRooms.findIndex(r => r.id === selected.id)
            if (roomIndex >= 0) {
              newRooms[roomIndex] = translateRoom(original, delta)
            }
            break
            
          case 'wall':
            const wallIndex = newWalls.findIndex(w => w.id === selected.id)
            if (wallIndex >= 0) {
              newWalls[wallIndex] = translateWall(original, delta)
            }
            break
            
          case 'door':
            const doorIndex = newDoors.findIndex(d => d.id === selected.id)
            if (doorIndex >= 0) {
              newDoors[doorIndex] = translateDoor(original, delta)
            }
            break
            
          case 'artwork':
            const artworkIndex = newArtworks.findIndex(a => a.id === selected.id)
            if (artworkIndex >= 0) {
              newArtworks[artworkIndex] = translateArtwork(original, delta)
            }
            break
            
          case 'verticalLink':
            const linkIndex = newVerticalLinks.findIndex(v => v.id === selected.id)
            if (linkIndex >= 0) {
              newVerticalLinks[linkIndex] = translateVerticalLink(original, delta)
            }
            break
        }
      })
      
      return {
        ...floor,
        rooms: newRooms,
        walls: newWalls,
        doors: newDoors,
        artworks: newArtworks,
        verticalLinks: newVerticalLinks
      }
    })
    
    // Validation (pour les rooms)
    let isValid = true
    let validationMessage: string | null = null
    
    for (const selected of dragState.draggedElements) {
      if (selected.type === 'room') {
        const updatedFloor = updatedFloors.find(f => f.id === currentFloor.id)
        const updatedRoom = updatedFloor?.rooms.find(r => r.id === selected.id)
        
        if (updatedRoom && updatedFloor) {
          const validation = validateRoomGeometry(updatedRoom, { floor: updatedFloor })
          if (!validation.valid) {
            isValid = false
            validationMessage = validation.message ?? null
            break
          }
        }
      }
    }
    
    // Mettre à jour l'état temporaire (sans historique)
    updateState({ floors: updatedFloors }, false)
    
    setDragState(prev => ({
      ...prev,
      currentPosition: snappedPos,
      isValid,
      validationMessage
    }))
  }, [dragState, state.floors, currentFloor, screenToWorld, updateState])

  /**
   * Terminer le drag
   */
  const finishDrag = useCallback(() => {
    if (!dragState.isDragging) return

    if (dragState.isValid && dragState.startPosition && dragState.currentPosition) {
      // Le drag est valide, sauvegarder dans l'historique
      const delta = calculateDelta(dragState.startPosition, dragState.currentPosition)
      const elementTypes = new Set(dragState.draggedElements.map(e => e.type))
      const description = `Déplacer ${dragState.draggedElements.length} ${Array.from(elementTypes).join(', ')}`
      
      updateState({}, true, description)
    } else {
      // Le drag est invalide, restaurer l'état original
      const updatedFloors = state.floors.map(floor => {
        if (floor.id !== currentFloor.id) return floor
        
        let newRooms = [...floor.rooms]
        let newWalls = floor.walls ? [...floor.walls] : []
        let newDoors = floor.doors ? [...floor.doors] : []
        let newArtworks = floor.artworks ? [...floor.artworks] : []
        let newVerticalLinks = floor.verticalLinks ? [...floor.verticalLinks] : []
        
        dragState.draggedElements.forEach(selected => {
          const original = dragState.originalElements.get(selected.id)
          if (!original) return
          
          switch (selected.type) {
            case 'room':
              const roomIndex = newRooms.findIndex(r => r.id === selected.id)
              if (roomIndex >= 0) {
                newRooms[roomIndex] = original
              }
              break
              
            case 'wall':
              const wallIndex = newWalls.findIndex(w => w.id === selected.id)
              if (wallIndex >= 0) {
                newWalls[wallIndex] = original
              }
              break
              
            case 'door':
              const doorIndex = newDoors.findIndex(d => d.id === selected.id)
              if (doorIndex >= 0) {
                newDoors[doorIndex] = original
              }
              break
              
            case 'artwork':
              const artworkIndex = newArtworks.findIndex(a => a.id === selected.id)
              if (artworkIndex >= 0) {
                newArtworks[artworkIndex] = original
              }
              break
              
            case 'verticalLink':
              const linkIndex = newVerticalLinks.findIndex(v => v.id === selected.id)
              if (linkIndex >= 0) {
                newVerticalLinks[linkIndex] = original
              }
              break
          }
        })
        
        return {
          ...floor,
          rooms: newRooms,
          walls: newWalls,
          doors: newDoors,
          artworks: newArtworks,
          verticalLinks: newVerticalLinks
        }
      })
      
      updateState({ floors: updatedFloors }, false)
    }
    
    setDragState({
      isDragging: false,
      draggedElements: [],
      startPosition: null,
      currentPosition: null,
      originalElements: new Map(),
      isValid: true,
      validationMessage: null
    })
  }, [dragState, state.floors, currentFloor, updateState])

  /**
   * Annuler le drag
   */
  const cancelDrag = useCallback(() => {
    if (!dragState.isDragging) return

    // Restaurer l'état original
    const updatedFloors = state.floors.map(floor => {
      if (floor.id !== currentFloor.id) return floor
      
      let newRooms = [...floor.rooms]
      let newWalls = floor.walls ? [...floor.walls] : []
      let newDoors = floor.doors ? [...floor.doors] : []
      let newArtworks = floor.artworks ? [...floor.artworks] : []
      let newVerticalLinks = floor.verticalLinks ? [...floor.verticalLinks] : []
      
      dragState.draggedElements.forEach(selected => {
        const original = dragState.originalElements.get(selected.id)
        if (!original) return
        
        switch (selected.type) {
          case 'room':
            const roomIndex = newRooms.findIndex(r => r.id === selected.id)
            if (roomIndex >= 0) {
              newRooms[roomIndex] = original
            }
            break
          // ... autres cas similaires
        }
      })
      
      return {
        ...floor,
        rooms: newRooms,
        walls: newWalls,
        doors: newDoors,
        artworks: newArtworks,
        verticalLinks: newVerticalLinks
      }
    })
    
    updateState({ floors: updatedFloors }, false)
    
    setDragState({
      isDragging: false,
      draggedElements: [],
      startPosition: null,
      currentPosition: null,
      originalElements: new Map(),
      isValid: true,
      validationMessage: null
    })
  }, [dragState, state.floors, currentFloor, updateState])

  return {
    dragState,
    startDrag,
    updateDrag,
    finishDrag,
    cancelDrag
  }
}
