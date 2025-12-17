/**
 * Hook pour gérer les interactions utilisateur sur le canvas
 * Centralise toute la logique d'interaction (click, pan, drag, etc.)
 * Évite la surcharge du composant Canvas principal
 */

import { useCallback, useState, useEffect, type MouseEvent } from "react"
import type { Point, EditorState, Floor } from "@/core/entities"
import { smartSnap } from "@/core/services"
import { v4 as uuidv4 } from "uuid"

interface CanvasInteractionOptions {
  state: EditorState
  currentFloor: Floor
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, description?: string) => void
  selection: any
  boxSelection: any
  shapeCreation: any
  freeFormCreation: any
  elementDrag: any
  vertexEdit: any
  screenToWorld: (x: number, y: number) => Point
}

export function useCanvasInteraction({
  state,
  currentFloor,
  updateState,
  selection,
  boxSelection,
  shapeCreation,
  freeFormCreation,
  elementDrag,
  vertexEdit,
  screenToWorld
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
    
    // Pan avec molette centrale
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      setCursorType('grabbing')
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
        
        // Vérifier si l'élément est déjà sélectionné
        const isAlreadySelected = state.selectedElements.some(
          el => el.id === elementId && el.type === selectionType
        )
        
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
        if (isAlreadySelected) {
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
    elementDrag,
    vertexEdit
  ])

  /**
   * Gestion du mouvement de la souris
   */
  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snapResult = smartSnap(worldPos, currentFloor)
    
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
    if (mouseDownInfo && !elementDrag.dragState.isDragging && !vertexEdit.editState.isEditing) {
      const distance = Math.sqrt(
        Math.pow(worldPos.x - mouseDownInfo.point.x, 2) +
        Math.pow(worldPos.y - mouseDownInfo.point.y, 2)
      )
      
      // Seuil de drag : 10px en coordonnées monde (plus tolérant pour éviter drags accidentels)
      const dragThreshold = 10 / state.zoom
      
      if (distance > dragThreshold) {
        const selectionInfo = mouseDownInfo.selectionInfo
        
        // Priorité 1 : Drag vertex/segment si c'est ce qui a été cliqué
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
    boxSelection,
    elementDrag,
    vertexEdit,
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
  }, [
    shapeCreation, 
    boxSelection, 
    selection, 
    state.selectedElements, 
    updateState,
    elementDrag,
    vertexEdit
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
  }, [shapeCreation])

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
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [elementDrag, vertexEdit])

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
