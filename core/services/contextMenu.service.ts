/**
 * ✅ SERVICE D'EXÉCUTION DES ACTIONS DU MENU CONTEXTUEL
 * 
 * Implémente toutes les actions disponibles
 * Réutilisable, scalable, modulaire
 */

import type { EditorState, Point, SelectedElement } from '@/core/entities'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, GRID_SIZE } from '@/core/constants'
import { validateRoomGeometry, validateArtworkPlacement } from './validation.service'
import { snapToGrid } from './geometry.service'
import { v4 as uuidv4 } from 'uuid'

// Presse-papier global
let clipboard: { element: SelectedElement; data: any } | null = null

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Supprimer un élément simple (room, artwork, door, wall)
 */
function deleteSimpleElement(
  floor: any,
  type: 'rooms' | 'artworks' | 'doors' | 'walls',
  id: string
): any {
  return {
    ...floor,
    [type]: (floor[type] || []).filter((el: any) => el.id !== id)
  }
}

/**
 * Valider et supprimer un vertex
 */
function deleteVertex(
  floor: any,
  roomId: string,
  vertexIndex: number
): { success: boolean; floor?: any; reason?: string } {
  const roomIndex = floor.rooms.findIndex((r: any) => r.id === roomId)
  if (roomIndex === -1) return { success: false, reason: 'Room not found' }

  const room = floor.rooms[roomIndex]
  const newPolygon = room.polygon.filter((_: any, i: number) => i !== vertexIndex)

  if (newPolygon.length < 3) {
    return { success: false, reason: 'Minimum 3 points required' }
  }

  const updatedRoom = { ...room, polygon: newPolygon }
  const validation = validateRoomGeometry(updatedRoom, { floor })

  if (!validation.valid) {
    return { success: false, reason: validation.message }
  }

  return {
    success: true,
    floor: {
      ...floor,
      rooms: floor.rooms.map((r: any, i: number) => i === roomIndex ? updatedRoom : r)
    }
  }
}

/**
 * Valider et supprimer un segment (via vertex suivant)
 */
function deleteSegment(
  floor: any,
  roomId: string,
  segmentIndex: number
): { success: boolean; floor?: any; reason?: string } {
  const roomIndex = floor.rooms.findIndex((r: any) => r.id === roomId)
  if (roomIndex === -1) return { success: false, reason: 'Room not found' }

  const room = floor.rooms[roomIndex]
  const nextVertexIndex = (segmentIndex + 1) % room.polygon.length
  const newPolygon = room.polygon.filter((_: any, i: number) => i !== nextVertexIndex)

  if (newPolygon.length < 3) {
    return { success: false, reason: 'Minimum 3 points required' }
  }

  const updatedRoom = { ...room, polygon: newPolygon }
  const validation = validateRoomGeometry(updatedRoom, { floor })

  if (!validation.valid) {
    return { success: false, reason: validation.message }
  }

  return {
    success: true,
    floor: {
      ...floor,
      rooms: floor.rooms.map((r: any, i: number) => i === roomIndex ? updatedRoom : r)
    }
  }
}

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
  const skippedElements: string[] = []
  let successCount = 0

  // SUPPRESSION EN CASCADE - Traiter chaque élément
  state.selectedElements.forEach(selected => {
    try {
      // Éléments simples (room, artwork, door, wall)
      if (['room', 'artwork', 'door', 'wall'].includes(selected.type)) {
        const typeMap: Record<string, 'rooms' | 'artworks' | 'doors' | 'walls'> = {
          room: 'rooms',
          artwork: 'artworks',
          door: 'doors',
          wall: 'walls'
        }
        updatedFloor = deleteSimpleElement(updatedFloor, typeMap[selected.type], selected.id)
        successCount++
      }
      // Vertex
      else if (selected.type === 'vertex' && selected.roomId && selected.vertexIndex !== undefined) {
        const result = deleteVertex(updatedFloor, selected.roomId, selected.vertexIndex)
        if (result.success && result.floor) {
          updatedFloor = result.floor
          successCount++
        } else {
          console.warn(`⚠️ Vertex ${selected.vertexIndex}: ${result.reason}`)
          skippedElements.push(`Vertex ${selected.vertexIndex}`)
        }
      }
      // Segment
      else if (selected.type === 'segment' && selected.roomId && selected.segmentIndex !== undefined) {
        const result = deleteSegment(updatedFloor, selected.roomId, selected.segmentIndex)
        if (result.success && result.floor) {
          updatedFloor = result.floor
          successCount++
        } else {
          console.warn(`⚠️ Segment ${selected.segmentIndex}: ${result.reason}`)
          skippedElements.push(`Segment ${selected.segmentIndex}`)
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
      
      // Valider la géométrie immédiatement
      const validation = validateRoomGeometry(newRoom, { floor: updatedFloor, strictMode: true })
      
      duplicatingElement = { 
        elementId: newRoom.id, 
        elementType: 'room',
        originalCenter: snappedMousePos,
        isValid: validation.valid,
        validationMessage: validation.message
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
      
      // Valider le placement
      const validation = validateArtworkPlacement(newArtwork, { floor: updatedFloor, strictMode: true })
      
      duplicatingElement = { 
        elementId: newArtwork.id, 
        elementType: 'artwork',
        originalCenter: snappedMousePos,
        isValid: validation.valid,
        validationMessage: validation.message
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

  const { elementType, elementId, originalCenter } = state.duplicatingElement
  const snappedPos = snapToGrid(newPosition, GRID_SIZE)
  const delta = { x: snappedPos.x - originalCenter.x, y: snappedPos.y - originalCenter.y }

  let updatedFloor = { ...floor }

  let isValid = true
  let validationMessage: string | undefined

  if (elementType === 'room') {
    const idx = updatedFloor.rooms.findIndex(r => r.id === elementId)
    if (idx !== -1) {
      const newPolygon = updatedFloor.rooms[idx].polygon.map(p => 
        snapToGrid({ x: p.x + delta.x, y: p.y + delta.y }, GRID_SIZE)
      )
      const updatedRoom = { ...updatedFloor.rooms[idx], polygon: newPolygon }
      updatedFloor.rooms = updatedFloor.rooms.map((r, i) => 
        i === idx ? updatedRoom : r
      )
      
      // Revalider avec TOUTES les contraintes (chevauchement, points dupliqués, etc.)
      const validation = validateRoomGeometry(updatedRoom, { floor: updatedFloor, strictMode: true })
      isValid = validation.valid
      validationMessage = validation.message
    }
  } else if (elementType === 'artwork') {
    const idx = (updatedFloor.artworks || []).findIndex(a => a.id === elementId)
    if (idx !== -1) {
      const updatedArtwork = { ...updatedFloor.artworks![idx], xy: [snappedPos.x, snappedPos.y] as const }
      updatedFloor.artworks = updatedFloor.artworks!.map((a, i) => 
        i === idx ? updatedArtwork : a
      )
      
      // Revalider le placement
      const validation = validateArtworkPlacement(updatedArtwork, { floor: updatedFloor, strictMode: true })
      isValid = validation.valid
      validationMessage = validation.message
    }
  }

  return {
    ...state,
    floors: state.floors.map(f => f.id === currentFloorId ? updatedFloor : f),
    duplicatingElement: { 
      ...state.duplicatingElement, 
      originalCenter: snappedPos,
      isValid,
      validationMessage
    }
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

  // Vérifier si la duplication est valide
  if (!state.duplicatingElement.isValid) {
    console.warn('❌ Duplication annulée: position invalide -', state.duplicatingElement.validationMessage)
    // Annuler la duplication si invalide
    return cancelDuplication(state, currentFloorId)
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
