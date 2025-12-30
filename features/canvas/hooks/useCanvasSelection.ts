/**
 * Hook pour gérer la sélection complète d'éléments sur le canvas
 * - Sélection éléments (rooms, walls, doors, artworks, verticalLinks)
 * - Sélection vertices (points de polygones)
 * - Sélection segments/edges
 * - Priorités: vertices → endpoints → segments → éléments → pièces
 * - Sélection intelligente avec continuité
 */

import { useCallback } from "react"
import type { Point, EditorState, SelectedElement, SelectionInfo, HoverInfo } from "@/core/entities"
import { 
  isPointInPolygon, 
  distanceToSegment, 
  distance, 
  applySmartSelection, 
  cleanRedundantSelection,
  getVerticalLinkCorners 
} from "@/core/services"
import { VERTEX_HIT_RADIUS, ENDPOINT_HIT_RADIUS, LINE_HIT_THRESHOLD } from "@/core/constants"

export interface SelectionOptions {
  tolerance: number
  multiSelect: boolean
  enableVertexSelection: boolean
  enableSegmentSelection: boolean
}

export interface SelectionResult {
  element: SelectedElement | null
  selectionInfo: SelectionInfo | null
  hoverInfo: HoverInfo | null
}

export function useCanvasSelection(
  state: EditorState,
  currentFloorId: string,
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean) => void,
  options: SelectionOptions = { 
    tolerance: 8, 
    multiSelect: true,
    enableVertexSelection: true,
    enableSegmentSelection: true
  }
) {
  const findElementAt = useCallback((point: Point, zoom: number): SelectionResult => {
    const currentFloor = state.floors.find(f => f.id === currentFloorId)
    if (!currentFloor) return { element: null, selectionInfo: null, hoverInfo: null }

    const tolerance = options.tolerance / zoom
    const vertexTolerance = VERTEX_HIT_RADIUS / zoom
    const endpointTolerance = ENDPOINT_HIT_RADIUS / zoom
    const lineTolerance = LINE_HIT_THRESHOLD / zoom

    // PRIORITÉ 1 : VERTICES DES VERTICAL LINKS
    if (options.enableVertexSelection && currentFloor.verticalLinks) {
      for (const link of currentFloor.verticalLinks) {
        const corners = getVerticalLinkCorners(link)
        for (let i = 0; i < corners.length; i++) {
          const corner = corners[i]
          const dist = distance(point, corner)
          
          if (dist <= vertexTolerance) {
            return {
              element: { type: 'verticalLink', id: link.id },
              selectionInfo: {
                id: link.id,
                type: 'verticalLinkVertex',
                vertexIndex: i,
                verticalLinkId: link.id
              },
              hoverInfo: {
                type: 'verticalLinkVertex',
                id: link.id,
                vertexIndex: i,
                verticalLinkId: link.id
              }
            }
          }
        }
      }
    }

    // PRIORITÉ 2 : VERTICES DES ROOMS
    if (options.enableVertexSelection) {
      for (const room of currentFloor.rooms) {
        for (let i = 0; i < room.polygon.length; i++) {
          const vertex = room.polygon[i]
          const dist = distance(point, vertex)
          
          if (dist <= vertexTolerance) {
            return {
              element: { type: 'room', id: room.id },
              selectionInfo: {
                id: room.id,
                type: 'vertex',
                vertexIndex: i,
                roomId: room.id
              },
              hoverInfo: {
                type: 'vertex',
                id: room.id,
                vertexIndex: i,
                roomId: room.id
              }
            }
          }
        }
      }
      
      // VERTICES DES MURS (si path défini)
      for (const wall of currentFloor.walls) {
        const points = wall.path || [wall.segment[0], wall.segment[1]]
        for (let i = 0; i < points.length; i++) {
          const vertex = points[i]
          const dist = distance(point, vertex)
          
          if (dist <= vertexTolerance) {
            return {
              element: { type: 'wall', id: wall.id },
              selectionInfo: {
                id: wall.id,
                type: 'wallVertex',
                vertexIndex: i,
                wallId: wall.id
              },
              hoverInfo: {
                type: 'wallVertex',
                id: wall.id,
                vertexIndex: i,
                wallId: wall.id
              }
            }
          }
        }
      }
    }

    // PRIORITÉ 2 : HANDLES/ENDPOINTS DE PORTES (avant tout le reste pour manipulation)
    for (const door of currentFloor.doors) {
      // Convertir coordonnées grille -> pixels
      const GRID_SIZE = 40
      for (let i = 0; i < 2; i++) {
        const endpoint = {
          x: door.segment[i].x * GRID_SIZE,
          y: door.segment[i].y * GRID_SIZE
        }
        const dist = distance(point, endpoint)
        
        if (dist <= endpointTolerance) {
          return {
            element: { type: 'door', id: door.id },
            selectionInfo: {
              id: door.id,
              type: 'door',
              endpointIndex: i
            },
            hoverInfo: {
              type: 'doorEndpoint',
              id: door.id,
              endpoint: i === 0 ? 'start' : 'end'
            }
          }
        }
      }
    }

    // PRIORITÉ 3 : ENDPOINTS (murs sans path)
    for (const wall of currentFloor.walls) {
      for (let i = 0; i < 2; i++) {
        const endpoint = wall.segment[i]
        const dist = distance(point, endpoint)
        
        if (dist <= endpointTolerance) {
          return {
            element: { type: 'wall', id: wall.id },
            selectionInfo: {
              id: wall.id,
              type: 'wallEndpoint',
              endpointIndex: i,
              wallId: wall.id
            },
            hoverInfo: {
              type: 'wallEndpoint',
              id: wall.id,
              endpoint: i === 0 ? 'start' : 'end'
            }
          }
        }
      }
    }

    // PRIORITÉ 4.5 : PORTES (avant segments de rooms, après artworks)
    for (const door of currentFloor.doors) {
      // Convertir coordonnées grille -> pixels
      const GRID_SIZE = 40
      const doorStart = {
        x: door.segment[0].x * GRID_SIZE,
        y: door.segment[0].y * GRID_SIZE
      }
      const doorEnd = {
        x: door.segment[1].x * GRID_SIZE,
        y: door.segment[1].y * GRID_SIZE
      }
      
      const dist = distanceToSegment(point, doorStart, doorEnd)
      if (dist <= tolerance * 1.5) { // Tolérance plus large pour faciliter sélection
        return {
          element: { type: 'door', id: door.id },
          selectionInfo: { id: door.id, type: 'door' },
          hoverInfo: { type: 'door', id: door.id }
        }
      }
    }

    // PRIORITÉ 5 : SEGMENTS DE ROOMS
    if (options.enableSegmentSelection) {
      for (const room of currentFloor.rooms) {
        for (let i = 0; i < room.polygon.length; i++) {
          const p1 = room.polygon[i]
          const p2 = room.polygon[(i + 1) % room.polygon.length]
          const dist = distanceToSegment(point, p1, p2)
          
          if (dist <= lineTolerance) {
            return {
              element: { type: 'room', id: room.id },
              selectionInfo: { 
                id: room.id, 
                type: 'segment',
                roomId: room.id,
                segmentIndex: i
              },
              hoverInfo: { 
                type: 'segment', 
                id: room.id,
                roomId: room.id,
                segmentIndex: i
              }
            }
          }
        }
      }
    }

    // PRIORITÉ 6 : ARTWORKS
    for (const artwork of currentFloor.artworks) {
      const [x, y] = artwork.xy
      const dx = point.x - x
      const dy = point.y - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      const radius = artwork.size ? Math.max(artwork.size[0], artwork.size[1]) / 2 : 30
      
      if (dist <= radius + tolerance) {
        return {
          element: { type: 'artwork', id: artwork.id },
          selectionInfo: { id: artwork.id, type: 'artwork' },
          hoverInfo: { type: 'artwork', id: artwork.id }
        }
      }
    }

    // PRIORITÉ 6.5 : VERTICAL LINKS (élément entier)
    for (const link of currentFloor.verticalLinks) {
      // Ignorer les liens d'autres étages
      if (link.floorId !== currentFloor.id) continue
      
      const halfWidth = link.size[0] / 2
      const halfHeight = link.size[1] / 2
      
      if (point.x >= link.position.x - halfWidth &&
          point.x <= link.position.x + halfWidth &&
          point.y >= link.position.y - halfHeight &&
          point.y <= link.position.y + halfHeight) {
        return {
          element: { type: 'verticalLink', id: link.id },
          selectionInfo: { id: link.id, type: 'verticalLink' },
          hoverInfo: { type: 'verticalLink', id: link.id }
        }
      }
    }

    // PRIORITÉ 4.5 : DOORS (placées avant segments de rooms)
    for (const door of currentFloor.doors) {
      const dist = distanceToSegment(point, door.segment[0], door.segment[1])
      if (dist <= tolerance) {
        return {
          element: { type: 'door', id: door.id },
          selectionInfo: { id: door.id, type: 'door' },
          hoverInfo: { type: 'door', id: door.id }
        }
      }
    }

    // PRIORITÉ 7 : WALLS (avec meilleure tolérance et support path)
    for (const wall of currentFloor.walls) {
      const points = wall.path || [wall.segment[0], wall.segment[1]]
      
      // Vérifier distance à chaque segment du path
      for (let i = 0; i < points.length - 1; i++) {
        const dist = distanceToSegment(point, points[i], points[i + 1])
        // Tolérance améliorée: épaisseur du mur + marge généreuse
        const wallTolerance = Math.max(wall.thickness / 2 + tolerance, lineTolerance * 1.5)
        
        if (dist <= wallTolerance) {
          return {
            element: { type: 'wall', id: wall.id },
            selectionInfo: { id: wall.id, type: 'wall' },
            hoverInfo: { type: 'wall', id: wall.id }
          }
        }
      }
    }

    // PRIORITÉ 8 : ROOMS (après les murs pour bonne hiérarchie)
    for (const room of currentFloor.rooms) {
      if (isPointInPolygon(point, room.polygon)) {
        return {
          element: { type: 'room', id: room.id },
          selectionInfo: { id: room.id, type: 'room' },
          hoverInfo: { type: 'room', id: room.id }
        }
      }
    }

    return { element: null, selectionInfo: null, hoverInfo: null }
  }, [state, currentFloorId, options])

  const selectElement = useCallback((
    result: SelectionResult | null,
    multiSelect: boolean = false
  ) => {
    if (!result || !result.element || !result.selectionInfo) {
      updateState({ 
        selectedElements: [],
        selectedElementId: null,
        selectedElementType: null
      }, false)
      return
    }

    const { element, selectionInfo } = result
    
    // Créer l'élément sélectionné avec toutes les infos nécessaires
    const selectedElement: SelectedElement = {
      type: selectionInfo.type as any,
      id: selectionInfo.id,
      ...(selectionInfo.vertexIndex !== undefined && { vertexIndex: selectionInfo.vertexIndex }),
      ...(selectionInfo.segmentIndex !== undefined && { segmentIndex: selectionInfo.segmentIndex }),
      ...(selectionInfo.roomId && { roomId: selectionInfo.roomId })
    }

    // Vérifier si c'est une sélection de sub-élément (vertex/segment) ou d'élément entier
    const isSubElement = selectedElement.type === 'vertex' || selectedElement.type === 'segment'
    const hasExistingSelection = state.selectedElements.length > 0
    const existingIsSubElement = hasExistingSelection && 
      (state.selectedElements[0].type === 'vertex' || state.selectedElements[0].type === 'segment')

    // Si on change de type de sélection (sub-element ⇔ full element), clear la sélection
    if (hasExistingSelection && isSubElement !== existingIsSubElement) {
      updateState({ 
        selectedElements: [selectedElement],
        selectedElementId: selectedElement.id,
        selectedElementType: selectedElement.type as any
      }, false)
      return
    }

    if (multiSelect && options.multiSelect) {
      const isAlreadySelected = state.selectedElements.some(sel => {
        if (sel.type !== selectedElement.type || sel.id !== selectedElement.id) return false
        if (sel.type === 'vertex') return sel.vertexIndex === selectedElement.vertexIndex
        if (sel.type === 'segment') return sel.segmentIndex === selectedElement.segmentIndex
        return true
      })

      if (isAlreadySelected) {
        const newSelection = state.selectedElements.filter(sel => {
          if (sel.type !== selectedElement.type || sel.id !== selectedElement.id) return true
          if (sel.type === 'vertex') return sel.vertexIndex !== selectedElement.vertexIndex
          if (sel.type === 'segment') return sel.segmentIndex !== selectedElement.segmentIndex
          return false
        })
        
        // Appliquer la sélection intelligente
        const currentFloor = state.floors.find(f => f.id === currentFloorId)
        const smartSelection = currentFloor 
          ? applySmartSelection(newSelection, currentFloor)
          : newSelection
        const cleanedSelection = cleanRedundantSelection(smartSelection)
        
        updateState({ 
          selectedElements: cleanedSelection,
          selectedElementId: cleanedSelection.length > 0 ? cleanedSelection[0].id : null,
          selectedElementType: cleanedSelection.length > 0 ? cleanedSelection[0].type as any : null
        }, false)
      } else {
        const newSelection = [...state.selectedElements, selectedElement]
        
        // Appliquer la sélection intelligente
        const currentFloor = state.floors.find(f => f.id === currentFloorId)
        const smartSelection = currentFloor 
          ? applySmartSelection(newSelection, currentFloor)
          : newSelection
        const cleanedSelection = cleanRedundantSelection(smartSelection)
        
        updateState({ 
          selectedElements: cleanedSelection,
          selectedElementId: selectedElement.id,
          selectedElementType: selectedElement.type as any
        }, false)
      }
    } else {
      updateState({ 
        selectedElements: [selectedElement],
        selectedElementId: selectedElement.id,
        selectedElementType: selectedElement.type as any
      }, false)
    }
  }, [state, currentFloorId, updateState, options.multiSelect])

  const clearSelection = useCallback(() => {
    updateState({ 
      selectedElements: [],
      selectedElementId: null,
      selectedElementType: null
    }, false)
  }, [updateState])

  const selectAll = useCallback(() => {
    const currentFloor = state.floors.find(f => f.id === currentFloorId)
    if (!currentFloor) return

    const allElements: SelectedElement[] = [
      ...currentFloor.rooms.map(r => ({ type: 'room' as const, id: r.id })),
      ...currentFloor.walls.map(w => ({ type: 'wall' as const, id: w.id })),
      ...currentFloor.doors.map(d => ({ type: 'door' as const, id: d.id })),
      ...currentFloor.artworks.map(a => ({ type: 'artwork' as const, id: a.id })),
      ...currentFloor.verticalLinks.map(v => ({ type: 'verticalLink' as const, id: v.id }))
    ]

    updateState({ 
      selectedElements: allElements,
      selectedElementId: allElements.length > 0 ? allElements[0].id : null,
      selectedElementType: allElements.length > 0 ? allElements[0].type as any : null
    }, false)
  }, [state, currentFloorId, updateState])

  const isSelected = useCallback((type: string, id: string): boolean => {
    return state.selectedElements.some(sel => sel.type === type && sel.id === id)
  }, [state.selectedElements])

  const findElementsInBounds = useCallback((
    min: Point,
    max: Point
  ): SelectedElement[] => {
    const currentFloor = state.floors.find(f => f.id === currentFloorId)
    if (!currentFloor) return []

    const selected: SelectedElement[] = []

    for (const room of currentFloor.rooms) {
      const allVerticesInside = room.polygon.every(vertex => 
        vertex.x >= min.x && vertex.x <= max.x &&
        vertex.y >= min.y && vertex.y <= max.y
      )
      
      if (allVerticesInside) {
        selected.push({ type: 'room', id: room.id })
      }
    }

    for (const wall of currentFloor.walls) {
      const allPointsInside = wall.segment.every(point =>
        point.x >= min.x && point.x <= max.x &&
        point.y >= min.y && point.y <= max.y
      )
      
      if (allPointsInside) {
        selected.push({ type: 'wall', id: wall.id })
      }
    }

    for (const door of currentFloor.doors) {
      const allPointsInside = door.segment.every(point =>
        point.x >= min.x && point.x <= max.x &&
        point.y >= min.y && point.y <= max.y
      )
      
      if (allPointsInside) {
        selected.push({ type: 'door', id: door.id })
      }
    }

    for (const artwork of currentFloor.artworks) {
      const [x, y] = artwork.xy
      if (x >= min.x && x <= max.x && y >= min.y && y <= max.y) {
        selected.push({ type: 'artwork', id: artwork.id })
      }
    }

    for (const link of currentFloor.verticalLinks) {
      // Ignorer les liens d'autres étages
      if (link.floorId !== currentFloor.id) continue
      
      const halfWidth = link.size[0] / 2
      const halfHeight = link.size[1] / 2
      
      // Vérifier si tous les coins du rectangle sont dans la zone de sélection
      const corners = [
        { x: link.position.x - halfWidth, y: link.position.y - halfHeight },
        { x: link.position.x + halfWidth, y: link.position.y - halfHeight },
        { x: link.position.x + halfWidth, y: link.position.y + halfHeight },
        { x: link.position.x - halfWidth, y: link.position.y + halfHeight }
      ]
      
      const allCornersInside = corners.every(corner =>
        corner.x >= min.x && corner.x <= max.x &&
        corner.y >= min.y && corner.y <= max.y
      )
      
      if (allCornersInside) {
        selected.push({ type: 'verticalLink', id: link.id })
      }
    }

    // Appliquer la sélection intelligente aux éléments trouvés
    const smartSelection = applySmartSelection(selected, currentFloor)
    return cleanRedundantSelection(smartSelection)
  }, [state, currentFloorId])

  return {
    findElementAt,
    selectElement,
    clearSelection,
    selectAll,
    isSelected,
    findElementsInBounds
  }
}
