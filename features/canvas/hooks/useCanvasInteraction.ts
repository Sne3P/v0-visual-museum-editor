/**
 * Hook pour gérer les interactions utilisateur sur le canvas
 * Centralise toute la logique d'interaction (click, pan, drag, etc.)
 * Évite la surcharge du composant Canvas principal
 */

import { useCallback, useState, useEffect, type MouseEvent } from "react"
import type { Point, EditorState, Floor } from "@/core/entities"
import { smartSnap, updateDuplicatingElementPosition, finalizeDuplication, cancelDuplication } from "@/core/services"
import { v4 as uuidv4 } from "uuid"

interface CanvasInteractionOptions {
  state: EditorState
  currentFloor: Floor
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, description?: string) => void
  selection: any
  boxSelection: any
  shapeCreation: any
  freeFormCreation: any
  wallCreation: any
  doorCreation: any
  verticalLinkCreation: any
  elementDrag: any
  vertexEdit: any
  verticalLinkEdit: any
  wallEndpointEdit: any
  screenToWorld: (x: number, y: number) => Point
  onContextMenu?: (x: number, y: number, worldPos: Point) => void
}

export function useCanvasInteraction({
  state,
  currentFloor,
  updateState,
  selection,
  boxSelection,
  shapeCreation,
  freeFormCreation,
  wallCreation,
  doorCreation,
  verticalLinkCreation,
  elementDrag,
  vertexEdit,
  verticalLinkEdit,
  wallEndpointEdit,
  screenToWorld,
  onContextMenu
}: CanvasInteractionOptions) {
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState<Point | null>(null)
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null)
  const [hoverInfo, setHoverInfo] = useState<any>(null)
  const [cursorType, setCursorType] = useState<'default' | 'grab' | 'grabbing' | 'crosshair'>('default')
  
  // État pour détecter drag vs clic
  const [mouseDownInfo, setMouseDownInfo] = useState<{
    point: Point
    time: number
    selectionInfo: any
  } | null>(null)

  /**
   * Gestion du clic gauche/droit
   */
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snapResult = smartSnap(worldPos, currentFloor)
    
    // MODE DUPLICATION: Clic gauche pour valider le placement
    if (e.button === 0 && state.duplicatingElement) {
      const finalState = finalizeDuplication(state, currentFloor.id)
      updateState(finalState, true, 'Dupliquer et placer')
      return
    }
    
    // Pan avec molette centrale
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      setCursorType('grabbing')
      return
    }
    
    // Clic droit → Menu contextuel
    if (e.button === 2) {
      e.preventDefault()
      // Si en mode duplication, annuler d'abord
      if (state.duplicatingElement) {
        updateState(cancelDuplication(state, currentFloor.id), false)
        return
      }
      if (onContextMenu) {
        onContextMenu(e.clientX, e.clientY, worldPos)
      }
      return
    }
    
    // Mode sélection
    if (e.button === 0 && state.selectedTool === 'select') {
      const result = selection.findElementAt(worldPos, state.zoom)
      
      if (result.element) {
        const isMultiSelect = e.ctrlKey || e.metaKey
        
        // Utiliser selectionInfo pour avoir le bon type (vertex/segment vs room)
        const selectionType = result.selectionInfo?.type || result.element.type
        const elementId = result.selectionInfo?.id || result.element.id
        
        // Vérifier si c'est EXACTEMENT le même élément (type + id + vertex/segment)
        const isExactlySameElement = state.selectedElements.some(el => {
          if (el.type !== selectionType || el.id !== elementId) return false
          
          // Pour vertices/segments, vérifier l'index
          if (selectionType === 'vertex' || selectionType === 'segment') {
            const clickedVertexIndex = result.selectionInfo?.vertexIndex
            const clickedSegmentIndex = result.selectionInfo?.segmentIndex
            return el.vertexIndex === clickedVertexIndex && el.segmentIndex === clickedSegmentIndex
          }
          
          return true
        })
        
        // CAS 1: Multi-sélection (Ctrl) → Ajouter/retirer de la sélection
        if (isMultiSelect) {
          selection.selectElement(result, true)  // multiSelect = true
          // Stocker info pour détecter drag potentiel au mouseMove
          setMouseDownInfo({
            point: worldPos,
            time: Date.now(),
            selectionInfo: result.selectionInfo
          })
          return
        }
        
        // CAS 2: Clic simple sur élément DÉJÀ sélectionné → Garder la sélection (pour multi-drag)
        if (isExactlySameElement) {
          // Ne pas changer la sélection, juste préparer le drag potentiel
          setMouseDownInfo({
            point: worldPos,
            time: Date.now(),
            selectionInfo: result.selectionInfo
          })
          return
        }
        
        // CAS 3: Clic simple sur élément NON sélectionné → Remplacer la sélection
        selection.selectElement(result, false)  // multiSelect = false (remplace)
        setMouseDownInfo({
          point: worldPos,
          time: Date.now(),
          selectionInfo: result.selectionInfo
        })
      } else {
        // Démarrer box selection si clic dans le vide
        boxSelection.startSelection(worldPos)
        setMouseDownInfo(null)
      }
      return
    }

    // Création de formes (drag-based: rectangle, circle, etc.)
    if (['rectangle', 'circle', 'triangle', 'arc'].includes(state.selectedTool)) {
      shapeCreation.startCreation(snapResult.point)
      setCursorType('crosshair')
      return
    }

    // Création de mur intérieur (drag-based)
    if (state.selectedTool === 'wall' && e.button === 0) {
      wallCreation.startCreation(snapResult.point)
      setCursorType('crosshair')
      return
    }

    // Création de porte (drag-based)
    if (state.selectedTool === 'door' && e.button === 0) {
      doorCreation.startCreation(snapResult.point)
      setCursorType('crosshair')
      return
    }

    // Création d'escalier ou ascenseur (drag-based)
    if ((state.selectedTool === 'stairs' || state.selectedTool === 'elevator') && e.button === 0) {
      verticalLinkCreation.startCreation(snapResult.point, state.selectedTool)
      setCursorType('crosshair')
      return
    }

    // Création forme libre (point par point)
    if (state.selectedTool === 'room' && e.button === 0) {
      freeFormCreation.addPoint(snapResult.point)
      setCursorType('crosshair')
    }
  }, [
    screenToWorld, 
    currentFloor, 
    state.selectedTool, 
    state.selectedElements,
    state.zoom,
    selection, 
    boxSelection, 
    shapeCreation, 
    freeFormCreation,
    wallCreation,
    doorCreation,
    verticalLinkCreation,
    elementDrag,
    vertexEdit,
    verticalLinkEdit
  ])

  /**
   * Gestion du mouvement de la souris
   */
  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snapResult = smartSnap(worldPos, currentFloor)
    
    // MODE DUPLICATION: Mettre à jour la position en temps réel
    if (state.duplicatingElement) {
      const snappedPos = snapResult.point
      const newState = updateDuplicatingElementPosition(state, currentFloor.id, snappedPos)
      updateState(newState, false)
      setHoveredPoint(snappedPos)
      setCursorType('default')
      return
    }
    
    // Pan en cours
    if (isPanning && lastPanPos) {
      const deltaX = e.clientX - lastPanPos.x
      const deltaY = e.clientY - lastPanPos.y
      
      updateState({
        pan: {
          x: state.pan.x + deltaX,
          y: state.pan.y + deltaY
        }
      }, false)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      return
    }
    
    setHoveredPoint(snapResult.point)
    
    // NOUVEAU: Détecter début de drag si mouseDown + mouvement suffisant
    if (mouseDownInfo && !elementDrag.dragState.isDragging && !vertexEdit.editState.isEditing && !verticalLinkEdit.editState.isEditing && !wallEndpointEdit.editState.isEditing) {
      const distance = Math.sqrt(
        Math.pow(worldPos.x - mouseDownInfo.point.x, 2) +
        Math.pow(worldPos.y - mouseDownInfo.point.y, 2)
      )
      
      // Seuil de drag : 10px en coordonnées monde (plus tolérant pour éviter drags accidentels)
      const dragThreshold = 10 / state.zoom
      
      if (distance > dragThreshold) {
        const selectionInfo = mouseDownInfo.selectionInfo
        
        // Priorité 0 : Drag wallVertex (vertex de mur)
        if (selectionInfo?.type === 'wallVertex' && selectionInfo?.wallId !== undefined) {
          wallEndpointEdit.startEdit(
            selectionInfo.wallId, 
            selectionInfo.vertexIndex ?? 0, 
            mouseDownInfo.point
          )
          setCursorType('grabbing')
          setMouseDownInfo(null)
          return
        }

        // Priorité 0.5 : Drag verticalLinkVertex
        if (selectionInfo?.type === 'verticalLinkVertex' && selectionInfo?.verticalLinkId !== undefined) {
          verticalLinkEdit.startEdit(
            selectionInfo.verticalLinkId, 
            selectionInfo.vertexIndex ?? 0, 
            mouseDownInfo.point
          )
          setCursorType('grabbing')
          setMouseDownInfo(null)
          return
        }
        
        // Priorité 1 : Drag wallEndpoint (avant vertex/segment de room)
        if (selection.hoverInfo?.type === 'wallEndpoint' && selection.hoverInfo?.id) {
          const endpointIndex = selection.hoverInfo.endpoint === 'start' ? 0 : 1
          wallEndpointEdit.startEdit(selection.hoverInfo.id, endpointIndex, mouseDownInfo.point)
          setCursorType('grabbing')
          setMouseDownInfo(null)
          return
        }
        
        // Priorité 2 : Drag vertex/segment de room si c'est ce qui a été cliqué
        if (selectionInfo?.type === 'vertex' && selectionInfo.roomId !== undefined) {
          // Drag d'un seul vertex
          vertexEdit.startEdit(selectionInfo.roomId, selectionInfo.vertexIndex!, mouseDownInfo.point)
          setCursorType('grabbing')
          setMouseDownInfo(null)
          return
        }
        
        if (selectionInfo?.type === 'segment' && selectionInfo.roomId !== undefined) {
          // Drag d'un seul segment
          vertexEdit.startSegmentEdit(
            selectionInfo.roomId, 
            selectionInfo.segmentIndex!,
            selectionInfo.segmentIndex! + 1,
            mouseDownInfo.point
          )
          setCursorType('grabbing')
          setMouseDownInfo(null)
          return
        }
        
        // Priorité 2 : Drag d'éléments complets (multi-drag supporté)
        // Si on a des éléments sélectionnés (rooms, walls, doors, etc.)
        const hasShapesSelected = state.selectedElements.some(
          el => el.type === 'room' || el.type === 'wall' || el.type === 'door' || 
                el.type === 'artwork' || el.type === 'verticalLink'
        )
        
        if (hasShapesSelected) {
          elementDrag.startDrag(e)
          setCursorType('grabbing')
          setMouseDownInfo(null)
          return
        }
        
        setMouseDownInfo(null)
      }
    }
    
    // NOUVEAU: Drag d'éléments en cours
    if (elementDrag.dragState.isDragging) {
      elementDrag.updateDrag(e)
      return
    }
    
    // NOUVEAU: Édition de vertex en cours
    if (vertexEdit.editState.isEditing) {
      vertexEdit.updateVertex(e, !e.shiftKey) // Shift = disable smart snap
      return
    }

    // NOUVEAU: Édition vertex vertical link en cours
    if (verticalLinkEdit.editState.isEditing) {
      verticalLinkEdit.updateEdit(e)
      return
    }
    
    // NOUVEAU: Édition endpoint mur en cours
    if (wallEndpointEdit.editState.isEditing) {
      wallEndpointEdit.updateEndpoint(e)
      return
    }
    
    // Détection hover en mode select
    if (state.selectedTool === 'select') {
      const result = selection.findElementAt(worldPos, state.zoom)
      setHoverInfo(result.hoverInfo)
      
      // Changer curseur selon hover
      if (result.element) {
        const isSelected = state.selectedElements.some(
          el => el.id === result.element.id && el.type === result.element.type
        )
        if (isSelected) {
          setCursorType('grab')
        } else {
          setCursorType('default')
        }
      } else {
        setCursorType('default')
      }
    } else {
      setHoverInfo(null)
      setCursorType('crosshair')
    }
    
    // Box selection en cours
    if (boxSelection.state.isActive) {
      boxSelection.updateSelection(worldPos)
      return
    }
    
    // Création drag en cours
    if (shapeCreation.state.isCreating) {
      shapeCreation.updateCreation(snapResult.point)
    }

    // Création mur en cours
    if (wallCreation.state.isCreating) {
      wallCreation.updateCreation(snapResult.point)
    }

    // Création porte en cours
    if (doorCreation.state.isCreating) {
      doorCreation.updateCreation(snapResult.point)
    }

    // Création lien vertical en cours (drag)
    if (verticalLinkCreation.state.isCreating) {
      verticalLinkCreation.updateCurrentPoint(snapResult.point)
    }

    // Création forme libre: mise à jour hover
    if (freeFormCreation.state.isCreating) {
      freeFormCreation.updateHover(snapResult.point)
    }
  }, [
    isPanning, 
    lastPanPos, 
    state.pan, 
    state.selectedTool,
    state.selectedElements,
    state.zoom,
    screenToWorld, 
    currentFloor, 
    updateState, 
    selection,
    shapeCreation, 
    freeFormCreation, 
    wallCreation,
    doorCreation,
    verticalLinkCreation,
    boxSelection,
    elementDrag,
    vertexEdit,
    verticalLinkEdit,
    mouseDownInfo
  ])

  /**
   * Gestion du relâchement de souris
   */
  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    // Pan terminé
    if (e.button === 1) {
      setIsPanning(false)
      setLastPanPos(null)
      setCursorType('default')
      return
    }
    
    // NOUVEAU: Drag d'éléments terminé
    if (elementDrag.dragState.isDragging) {
      elementDrag.finishDrag()
      setCursorType('grab')
      setMouseDownInfo(null)
      return
    }
    
    // NOUVEAU: Édition vertex terminée
    if (vertexEdit.editState.isEditing) {
      vertexEdit.finishEdit()
      setCursorType('default')
      setMouseDownInfo(null)
      return
    }

    // NOUVEAU: Édition vertex vertical link terminée
    if (verticalLinkEdit.editState.isEditing) {
      verticalLinkEdit.finishEdit()
      setCursorType('default')
      setMouseDownInfo(null)
      return
    }
    
    // NOUVEAU: Édition endpoint mur terminée
    if (wallEndpointEdit.editState.isEditing) {
      wallEndpointEdit.finishEdit()
      setCursorType('default')
      setMouseDownInfo(null)
      return
    }
    
    // Réinitialiser mouseDownInfo si pas de drag
    setMouseDownInfo(null)
    
    // Box selection terminée
    if (e.button === 0 && boxSelection.state.isActive) {
      const bounds = boxSelection.finishSelection()
      if (bounds) {
        const elementsInBox = selection.findElementsInBounds(bounds.min, bounds.max)
        const isAdditive = e.shiftKey
        
        if (isAdditive) {
          const newSelection = [...state.selectedElements, ...elementsInBox]
          const unique = newSelection.filter((el, index, self) =>
            index === self.findIndex(e => e.type === el.type && e.id === el.id)
          )
          updateState({
            selectedElements: unique,
            selectedElementId: unique.length > 0 ? unique[0].id : null,
            selectedElementType: unique.length > 0 ? unique[0].type : null
          }, false)
        } else {
          updateState({
            selectedElements: elementsInBox,
            selectedElementId: elementsInBox.length > 0 ? elementsInBox[0].id : null,
            selectedElementType: elementsInBox.length > 0 ? elementsInBox[0].type : null
          }, false)
        }
      }
      setCursorType('default')
      return
    }
    
    // Création drag terminée
    if (e.button === 0 && shapeCreation.state.isCreating) {
      shapeCreation.finishCreation()
      setCursorType('crosshair')
    }

    // Création mur terminée
    if (e.button === 0 && wallCreation.state.isCreating) {
      wallCreation.completeCreation()
      setCursorType('crosshair')
    }

    // Création porte terminée
    if (e.button === 0 && doorCreation.state.isCreating) {
      doorCreation.completeCreation()
      setCursorType('crosshair')
    }
    
    // Création lien vertical terminée (drag-based)
    if (e.button === 0 && verticalLinkCreation.state.isCreating) {
      verticalLinkCreation.finishCreation()
      setCursorType('crosshair')
    }
  }, [
    shapeCreation, 
    wallCreation,
    doorCreation,
    verticalLinkCreation,
    boxSelection, 
    selection, 
    state.selectedElements, 
    updateState,
    elementDrag,
    vertexEdit,
    verticalLinkEdit,
    wallEndpointEdit
  ])

  /**
   * Gestion de la sortie du canvas
   */
  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null)
    setCursorType('default')
    if (shapeCreation.state.isCreating) {
      shapeCreation.cancelCreation()
    }
    if (wallCreation.state.isCreating) {
      wallCreation.cancelCreation()
    }
    if (doorCreation.state.isCreating) {
      doorCreation.cancelCreation()
    }
  }, [shapeCreation, wallCreation, doorCreation])

  /**
   * Gestion clavier (Échap pour annuler drag/edit)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (elementDrag.dragState.isDragging) {
          elementDrag.cancelDrag()
          setCursorType('default')
        } else if (vertexEdit.editState.isEditing) {
          vertexEdit.cancelEdit()
          setCursorType('default')
        } else if (wallEndpointEdit.editState.isEditing) {
          wallEndpointEdit.cancelEdit()
          setCursorType('default')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [elementDrag, vertexEdit, wallEndpointEdit])

  return {
    // État
    isPanning,
    hoveredPoint,
    hoverInfo,
    cursorType,
    
    // Handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave
  }
}
