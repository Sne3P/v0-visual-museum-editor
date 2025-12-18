/**
 * ✅ SERVICE D'EXÉCUTION DES ACTIONS DU MENU CONTEXTUEL
 * 
 * Implémente toutes les actions disponibles
 * Réutilisable, scalable, modulaire
 */

import type { EditorState, Point, SelectedElement } from '@/core/entities'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, GRID_SIZE } from '@/core/constants'
import { validateRoomGeometry } from './validation.service'
import { snapToGrid } from './geometry.service'
import { v4 as uuidv4 } from 'uuid'

// Presse-papier global
let clipboard: { element: SelectedElement; data: any } | null = null

// ============================================================
// ACTIONS COMMUNES
// ============================================================

/**
 * SUPPRIMER - Supprime élément(s) sélectionné(s)
 */
export function executeSupprimer(
  state: EditorState,
  currentFloorId: string
): EditorState {
  console.log('🗑️ SERVICE.SUPPRIMER: Début, selectedElements:', state.selectedElements.length)
  
  if (state.selectedElements.length === 0) {
    console.log('⚠️ SERVICE.SUPPRIMER: Aucun élément sélectionné!')
    return state
  }

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  let updatedFloor = { ...floor }
  const skippedElements: string[] = [] // Pour tracking des éléments non supprimables
  let successCount = 0

  // SUPPRESSION EN CASCADE - Traiter chaque élément sélectionné
  state.selectedElements.forEach(selected => {
    try {
      if (selected.type === 'room') {
        updatedFloor = {
          ...updatedFloor,
          rooms: updatedFloor.rooms.filter(r => r.id !== selected.id)
        }
        successCount++
      } 
      else if (selected.type === 'artwork') {
        updatedFloor = {
          ...updatedFloor,
          artworks: (updatedFloor.artworks || []).filter(a => a.id !== selected.id)
        }
        successCount++
      } 
      else if (selected.type === 'door') {
        updatedFloor = {
          ...updatedFloor,
          doors: (updatedFloor.doors || []).filter(d => d.id !== selected.id)
        }
        successCount++
      } 
      else if (selected.type === 'wall') {
        updatedFloor = {
          ...updatedFloor,
          walls: (updatedFloor.walls || []).filter(w => w.id !== selected.id)
        }
        successCount++
      } 
      else if (selected.type === 'vertex' && selected.roomId) {
        const roomIndex = updatedFloor.rooms.findIndex(r => r.id === selected.roomId)
        if (roomIndex !== -1 && selected.vertexIndex !== undefined) {
          const room = updatedFloor.rooms[roomIndex]
          const newPolygon = room.polygon.filter((_, i) => i !== selected.vertexIndex)
          
          // Vérifier minimum 3 points
          if (newPolygon.length < 3) {
            console.warn(`⚠️ Vertex non supprimable: minimum 3 points requis (${room.id})`)
            skippedElements.push(`Vertex ${selected.vertexIndex}`)
            return // Skip cet élément, continuer avec les autres
          }
          
          // Valider la géométrie résultante
          const updatedRoom = { ...room, polygon: newPolygon }
          const validation = validateRoomGeometry(updatedRoom, { floor: updatedFloor })
          
          if (!validation.valid) {
            console.warn(`⚠️ Vertex non supprimable: géométrie invalide (${validation.message})`)
            skippedElements.push(`Vertex ${selected.vertexIndex}`)
            return // Skip cet élément, continuer avec les autres
          }
          
          // Suppression OK
          updatedFloor = {
            ...updatedFloor,
            rooms: updatedFloor.rooms.map((r, i) => i === roomIndex ? updatedRoom : r)
          }
          successCount++
        }
      } 
      else if (selected.type === 'segment' && selected.roomId && selected.segmentIndex !== undefined) {
        const roomIndex = updatedFloor.rooms.findIndex(r => r.id === selected.roomId)
        if (roomIndex !== -1) {
          const room = updatedFloor.rooms[roomIndex]
          const nextVertexIndex = (selected.segmentIndex + 1) % room.polygon.length
          const newPolygon = room.polygon.filter((_, i) => i !== nextVertexIndex)
          
          // Vérifier minimum 3 points
          if (newPolygon.length < 3) {
            console.warn(`⚠️ Segment non supprimable: minimum 3 points requis (${room.id})`)
            skippedElements.push(`Segment ${selected.segmentIndex}`)
            return // Skip cet élément, continuer avec les autres
          }
          
          // Valider la géométrie résultante
          const updatedRoom = { ...room, polygon: newPolygon }
          const validation = validateRoomGeometry(updatedRoom, { floor: updatedFloor })
          
          if (!validation.valid) {
            console.warn(`⚠️ Segment non supprimable: géométrie invalide (${validation.message})`)
            skippedElements.push(`Segment ${selected.segmentIndex}`)
            return // Skip cet élément, continuer avec les autres
          }
          
          // Suppression OK
          updatedFloor = {
            ...updatedFloor,
            rooms: updatedFloor.rooms.map((r, i) => i === roomIndex ? updatedRoom : r)
          }
          successCount++
        }
      }
    } catch (error) {
      console.error(`❌ Erreur suppression ${selected.type}:`, error)
      skippedElements.push(`${selected.type} ${selected.id || ''}`)
    }
  })

  // Log du résultat
  console.log(`✅ Suppression terminée: ${successCount} éléments supprimés, ${skippedElements.length} ignorés`)
  if (skippedElements.length > 0) {
    console.warn('⚠️ Éléments non supprimés:', skippedElements)
  }

  return {
    ...state,
    floors: state.floors.map(f => f.id === currentFloorId ? updatedFloor : f),
    selectedElements: []
  }
}

/**
 * DUPLIQUER - Duplique élément à la position de la souris (snappé à la grille)
 */
export function executeDupliquer(
  state: EditorState,
  currentFloorId: string,
  mousePosition: Point
): EditorState {
  if (state.selectedElements.length === 0) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  const selected = state.selectedElements[0]
  let updatedFloor = { ...floor }
  let duplicatingElement: { elementId: string; elementType: 'room' | 'artwork'; originalCenter: Point } | null = null

  // Snap position souris à la grille
  const snappedMousePos = snapToGrid(mousePosition, GRID_SIZE)

  if (selected.type === 'room') {
    const room = updatedFloor.rooms.find(r => r.id === selected.id)
    if (room) {
      // Calculer centre original
      const originalCenterX = room.polygon.reduce((sum, p) => sum + p.x, 0) / room.polygon.length
      const originalCenterY = room.polygon.reduce((sum, p) => sum + p.y, 0) / room.polygon.length
      
      // Décaler polygone vers position souris SNAPPÉE
      const deltaX = snappedMousePos.x - originalCenterX
      const deltaY = snappedMousePos.y - originalCenterY
      
      const newRoom = {
        ...room,
        id: uuidv4(),
        polygon: room.polygon.map(p => snapToGrid({
          x: p.x + deltaX,
          y: p.y + deltaY
        }, GRID_SIZE))
      }
      updatedFloor = { ...updatedFloor, rooms: [...updatedFloor.rooms, newRoom] }
      
      duplicatingElement = { 
        elementId: newRoom.id, 
        elementType: 'room',
        originalCenter: snappedMousePos
      }
    }
  } else if (selected.type === 'artwork') {
    const artwork = (updatedFloor.artworks || []).find(a => a.id === selected.id)
    if (artwork) {
      const newArtwork = {
        ...artwork,
        id: uuidv4(),
        xy: [snappedMousePos.x, snappedMousePos.y] as const
      }
      updatedFloor = { ...updatedFloor, artworks: [...(updatedFloor.artworks || []), newArtwork] }
      
      duplicatingElement = { 
        elementId: newArtwork.id, 
        elementType: 'artwork',
        originalCenter: snappedMousePos
      }
    }
  }

  return {
    ...state,
    floors: state.floors.map(f => f.id === currentFloorId ? updatedFloor : f),
    contextMenu: null,
    selectedElements: duplicatingElement ? [{ type: duplicatingElement.elementType, id: duplicatingElement.elementId }] : [],
    duplicatingElement
  }
}

/**
 * METTRE À JOUR POSITION PENDANT DUPLICATION
 */
export function updateDuplicatingElementPosition(
  state: EditorState,
  currentFloorId: string,
  newPosition: Point
): EditorState {
  if (!state.duplicatingElement) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  let updatedFloor = { ...floor }
  const { originalCenter } = state.duplicatingElement
  const snappedPos = snapToGrid(newPosition, GRID_SIZE)
  const delta = { x: snappedPos.x - originalCenter.x, y: snappedPos.y - originalCenter.y }

  if (state.duplicatingElement.elementType === 'room') {
    const roomIndex = updatedFloor.rooms.findIndex(r => r.id === state.duplicatingElement!.elementId)
    if (roomIndex !== -1) {
      const room = updatedFloor.rooms[roomIndex]
      const newPolygon = room.polygon.map(p => snapToGrid({ x: p.x + delta.x, y: p.y + delta.y }, GRID_SIZE))
      updatedFloor = {
        ...updatedFloor,
        rooms: updatedFloor.rooms.map((r, i) => i === roomIndex ? { ...r, polygon: newPolygon } : r)
      }
    }
  } else if (state.duplicatingElement.elementType === 'artwork') {
    const artworkIndex = (updatedFloor.artworks || []).findIndex(a => a.id === state.duplicatingElement!.elementId)
    if (artworkIndex !== -1) {
      updatedFloor = {
        ...updatedFloor,
        artworks: updatedFloor.artworks!.map((a, i) => 
          i === artworkIndex ? { ...a, xy: [snappedPos.x, snappedPos.y] as const } : a
        )
      }
    }
  }

  return {
    ...state,
    floors: state.floors.map(f => f.id === currentFloorId ? updatedFloor : f),
    duplicatingElement: { ...state.duplicatingElement, originalCenter: snappedPos }
  }
}

/**
 * VALIDER/FINALISER DUPLICATION avec validation
 */
export function finalizeDuplication(
  state: EditorState,
  currentFloorId: string
): EditorState {
  if (!state.duplicatingElement) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  // Valider la position finale
  if (state.duplicatingElement.elementType === 'room') {
    const room = floor.rooms.find(r => r.id === state.duplicatingElement!.elementId)
    if (room) {
      const validation = validateRoomGeometry(room, { floor, strictMode: true })
      if (!validation.valid) {
        // Annuler si invalide
        return cancelDuplication(state, currentFloorId)
      }
    }
  }

  return {
    ...state,
    duplicatingElement: null,
    selectedElements: [{
      type: state.duplicatingElement.elementType,
      id: state.duplicatingElement.elementId
    }]
  }
}

/**
 * ANNULER DUPLICATION
 * Annule le mode duplication et supprime l'élément créé
 */
export function cancelDuplication(
  state: EditorState,
  currentFloorId: string
): EditorState {
  if (!state.duplicatingElement) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  let updatedFloor = { ...floor }

  if (state.duplicatingElement.elementType === 'room') {
    updatedFloor = {
      ...updatedFloor,
      rooms: updatedFloor.rooms.filter(r => r.id !== state.duplicatingElement!.elementId)
    }
  } else if (state.duplicatingElement.elementType === 'artwork') {
    updatedFloor = {
      ...updatedFloor,
      artworks: (updatedFloor.artworks || []).filter(a => a.id !== state.duplicatingElement!.elementId)
    }
  }

  return {
    ...state,
    floors: state.floors.map(f => f.id === currentFloorId ? updatedFloor : f),
    duplicatingElement: null
  }
}
export function executeCopier(
  state: EditorState,
  currentFloorId: string
): EditorState {
  if (state.selectedElements.length === 0) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  const firstSelected = state.selectedElements[0]
  clipboard = { element: firstSelected, data: null }

  if (firstSelected.type === 'room') {
    const room = floor.rooms.find(r => r.id === firstSelected.id)
    if (room) clipboard.data = room
  }

  console.log('Copié:', clipboard)
  return state
}

/**
 * COLLER - Colle élément(s) depuis le presse-papier
 */
export function executeColler(
  state: EditorState,
  currentFloorId: string
): EditorState {
  if (!clipboard) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  let updatedFloor = { ...floor }

  if (clipboard.element.type === 'room' && clipboard.data) {
    const newRoom = {
      ...clipboard.data,
      id: uuidv4(),
      polygon: clipboard.data.polygon.map((p: Point) => ({ x: p.x + 80, y: p.y + 80 }))
    }
    updatedFloor = { ...updatedFloor, rooms: [...updatedFloor.rooms, newRoom] }
  }

  return {
    ...state,
    floors: state.floors.map(f => f.id === currentFloorId ? updatedFloor : f)
  }
}

/**
 * AJOUTER UN VERTEX - Ajoute un vertex à la position de la souris sur un segment
 */
export function executeAjouterVertex(
  state: EditorState,
  currentFloorId: string,
  worldPos: Point
): EditorState {
  const selected = state.selectedElements.find(el => el.type === 'segment')
  if (!selected || !selected.roomId || selected.segmentIndex === undefined) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  const roomIndex = floor.rooms.findIndex(r => r.id === selected.roomId)
  if (roomIndex === -1) return state

  const room = floor.rooms[roomIndex]
  const segmentIndex = selected.segmentIndex
  const nextIndex = (segmentIndex + 1) % room.polygon.length
  const newPoint = snapToGrid(worldPos, GRID_SIZE)

  // Ajouter le vertex
  const newPolygon = [
    ...room.polygon.slice(0, nextIndex),
    newPoint,
    ...room.polygon.slice(nextIndex)
  ]

  const updatedRoom = { ...room, polygon: newPolygon }

  // Validation globale après ajout
  const validation = validateRoomGeometry(updatedRoom, { floor, strictMode: true })
  if (!validation.valid) {
    return state  // Rejeter si invalide
  }

  return {
    ...state,
    floors: state.floors.map(f => 
      f.id === currentFloorId
        ? {
            ...f,
            rooms: f.rooms.map((r, i) => i === roomIndex ? updatedRoom : r)
          }
        : f
    ),
    selectedElements: []
  }
}

/**
 * DIVISER UN SEGMENT - Divise un segment en son point milieu
 */
export function executeDiviserSegment(
  state: EditorState,
  currentFloorId: string
): EditorState {
  const selected = state.selectedElements.find(el => el.type === 'segment')
  if (!selected || !selected.roomId || selected.segmentIndex === undefined) return state

  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  const roomIndex = floor.rooms.findIndex(r => r.id === selected.roomId)
  if (roomIndex === -1) return state

  const room = floor.rooms[roomIndex]
  const segmentIndex = selected.segmentIndex
  const nextIndex = (segmentIndex + 1) % room.polygon.length

  // Calculer le point milieu du segment
  const p1 = room.polygon[segmentIndex]
  const p2 = room.polygon[nextIndex]
  const midpoint = snapToGrid({
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  }, GRID_SIZE)

  // Insérer le point milieu dans le polygone
  const newPolygon = [
    ...room.polygon.slice(0, nextIndex),
    midpoint,
    ...room.polygon.slice(nextIndex)
  ]

  const updatedRoom = { ...room, polygon: newPolygon }

  // Validation globale
  const validation = validateRoomGeometry(updatedRoom, { floor, strictMode: true })
  if (!validation.valid) {
    return state
  }

  return {
    ...state,
    floors: state.floors.map(f => 
      f.id === currentFloorId
        ? {
            ...f,
            rooms: f.rooms.map((r, i) => i === roomIndex ? updatedRoom : r)
          }
        : f
    ),
    selectedElements: []
  }
}

/**
 * PROPRIÉTÉS - À implémenter avec panel
 */
export function executeProprietes(
  state: EditorState,
  elementId: string,
  elementType: string
): EditorState {
  console.log('Ouvrir propriétés pour:', elementType, elementId)
  return state
}

// ============================================================
// ACTIONS BACKGROUND (Zoom, Pan, etc.)
// ============================================================

/**
 * ZOOM AVANT
 */
export function executeZoomAvant(state: EditorState): EditorState {
  const newZoom = Math.min(state.zoom * ZOOM_STEP, MAX_ZOOM)
  return { ...state, zoom: newZoom }
}

/**
 * ZOOM ARRIÈRE
 */
export function executeZoomArriere(state: EditorState): EditorState {
  const newZoom = Math.max(state.zoom / ZOOM_STEP, MIN_ZOOM)
  return { ...state, zoom: newZoom }
}

/**
 * RÉINITIALISER ZOOM
 */
export function executeReinitialiserZoom(state: EditorState): EditorState {
  return { ...state, zoom: 1, pan: { x: 0, y: 0 } }
}

/**
 * AJUSTER LA VUE
 */
export function executeAjusterVue(
  state: EditorState,
  currentFloorId: string,
  canvasWidth: number,
  canvasHeight: number
): EditorState {
  const floor = state.floors.find(f => f.id === currentFloorId)
  if (!floor) return state

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  floor.rooms.forEach(room => {
    room.polygon.forEach(p => {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    })
  })

  if (!isFinite(minX)) return state

  const margin = 40 * 4
  const contentWidth = maxX - minX + margin * 2
  const contentHeight = maxY - minY + margin * 2

  const zoomX = canvasWidth / contentWidth
  const zoomY = canvasHeight / contentHeight
  const newZoom = Math.min(zoomX, zoomY, MAX_ZOOM)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const newPan = {
    x: canvasWidth / 2 - centerX * newZoom,
    y: canvasHeight / 2 - centerY * newZoom
  }

  return { ...state, zoom: newZoom, pan: newPan }
}

/**
 * ACTUALISER - Force re-render
 */
export function executeActualiser(state: EditorState): EditorState {
  return { ...state }
}
