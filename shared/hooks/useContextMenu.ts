/**
 * HOOK POUR GÉRER LE MENU CONTEXTUEL
 * Gestion complète du clic droit avec détection d'élément
 */

import { useCallback, useState, useEffect } from 'react'
import type { Point, EditorState, ContextMenuState, ContextMenuAction, SelectedElement } from '@/core/entities'
import { getActionsForElementType } from '@/core/constants'
import {
  executeSupprimer,
  executeDupliquer,
  executeColler,
  executeAjouterVertex,
  executeDiviserSegment,
  executeDiviserMur,
  executeAjouterPointMur,
  executeProprietes,
  executeZoomAvant,
  executeZoomArriere,
  executeReinitialiserZoom,
  executeAjusterVue,
  executeActualiser,
} from '@/core/services'

interface UseContextMenuOptions {
  state: EditorState
  currentFloor: { id: string }
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, historyLabel?: string) => void
  detectElementAt: (point: Point, zoom: number) => {
    element: any
    selectionInfo: any
  }
  canvasRef?: React.RefObject<HTMLCanvasElement>
  onOpenPropertiesModal?: (type: 'room' | 'artwork' | 'wall' | 'door' | 'verticalLink', id: string) => void
  onEditVerticalLinkFloors?: (linkId: string) => void
}

interface UseContextMenuReturn {
  /**
   * Ouvrir le menu contextuel
   */
  openContextMenu: (x: number, y: number, worldPos: Point) => void
  
  /**
   * Fermer le menu contextuel
   */
  closeContextMenu: () => void
  
  /**
   * Exécuter une action du menu
   */
  executeAction: (action: ContextMenuAction) => void
  
  /**
   * Liste des actions disponibles
   */
  actions: ContextMenuAction[]
}

/**
 * Hook pour gérer le menu contextuel
 */
export function useContextMenu({
  state,
  currentFloor,
  updateState,
  detectElementAt,
  canvasRef,
  onOpenPropertiesModal,
  onEditVerticalLinkFloors,
}: UseContextMenuOptions): UseContextMenuReturn {
  // État local pour les actions disponibles
  const [actions, setActions] = useState<ContextMenuAction[]>([])
  const [lastWorldPos, setLastWorldPos] = useState<Point>({ x: 0, y: 0 })
  
  /**
   * Ouvrir le menu contextuel à une position donnée
   */
  const openContextMenu = useCallback(
    (x: number, y: number, worldPos: Point) => {
      // Détecter l'élément sous la souris
      const detection = detectElementAt(worldPos, state.zoom)
      
      let contextMenu: ContextMenuState
      let actionsForElement: ContextMenuAction[]
      let selectedElements: SelectedElement[] = []
      
      if (detection.element && detection.selectionInfo) {
        // Menu pour un élément spécifique
        contextMenu = {
          visible: true,
          x,
          y,
          type: 'element',
          elementId: detection.selectionInfo.id,
          elementType: detection.selectionInfo.type,
          worldPos,
        }
        
        // Créer l'élément sélectionné
        selectedElements = [{
          type: detection.selectionInfo.type,
          id: detection.selectionInfo.id,
          vertexIndex: detection.selectionInfo.vertexIndex,
          segmentIndex: detection.selectionInfo.segmentIndex,
          roomId: detection.selectionInfo.roomId,
        }]
        
        // Obtenir les actions pour ce type d'élément
        actionsForElement = getActionsForElementType(detection.selectionInfo.type)
      } else {
        // Menu pour le fond
        contextMenu = {
          visible: true,
          x,
          y,
          type: 'background',
          worldPos,
        }
        
        // Obtenir les actions pour le fond
        actionsForElement = getActionsForElementType('background')
      }
      
      // Sauvegarder la position du monde pour l'action
      setLastWorldPos(worldPos)
      
      // Mettre à jour l'état ET les actions
      setActions(actionsForElement)
      updateState({
        contextMenu,
        selectedElements,
      })
    },
    [detectElementAt, state.zoom, updateState]
  )
  
  /**
   * Fermer le menu contextuel
   */
  const closeContextMenu = useCallback(() => {
    updateState({
      contextMenu: null,
    })
    setActions([])
  }, [updateState])
  
  /**
   * Exécuter une action du menu contextuel
   */
  const executeAction = useCallback(
    async (action: ContextMenuAction) => {

      let updates: Partial<EditorState> | null = null
      let saveHistory = true
      let historyLabel = ''
      
      // Mapping action → (service call, history)
      const actionHandlers: Record<string, () => void | Promise<void>> = {
        supprimer: async () => {
          const newState = await executeSupprimer(state, currentFloor.id)
          updates = { floors: newState.floors, selectedElements: newState.selectedElements }
          historyLabel = 'Supprimer élément'
        },
        dupliquer: () => {
          const newState = executeDupliquer(state, currentFloor.id, lastWorldPos)
          updates = { floors: newState.floors, selectedElements: newState.selectedElements, duplicatingElement: newState.duplicatingElement, contextMenu: null }
          saveHistory = false
        },
        coller: () => {
          const newState = executeColler(state, currentFloor.id)
          updates = { floors: newState.floors }
          historyLabel = 'Coller'
        },
        proprietes: () => {
          if (state.contextMenu?.elementId && state.contextMenu?.elementType) {
            onOpenPropertiesModal?.(
              state.contextMenu.elementType as 'room' | 'artwork' | 'wall' | 'door' | 'verticalLink',
              state.contextMenu.elementId
            )
          }
          saveHistory = false
        },
        ajouter_vertex: () => {
          const newState = executeAjouterVertex(state, currentFloor.id, lastWorldPos)
          updates = { floors: newState.floors, selectedElements: newState.selectedElements }
          historyLabel = 'Ajouter un sommet'
        },
        diviser: () => {
          const newState = executeDiviserSegment(state, currentFloor.id)
          updates = { floors: newState.floors, selectedElements: newState.selectedElements }
          historyLabel = 'Diviser un segment'
        },
        diviser_mur: () => {
          const newState = executeDiviserMur(state, currentFloor.id)
          updates = { floors: newState.floors, selectedElements: newState.selectedElements }
          historyLabel = 'Diviser le mur'
        },
        ajouter_point_mur: () => {
          const newState = executeAjouterPointMur(state, currentFloor.id, lastWorldPos)
          updates = { floors: newState.floors, selectedElements: newState.selectedElements }
          historyLabel = 'Ajouter un point au mur'
        },
        zoom_avant: () => {
          updates = { zoom: executeZoomAvant(state).zoom }
          saveHistory = false
        },
        zoom_arriere: () => {
          updates = { zoom: executeZoomArriere(state).zoom }
          saveHistory = false
        },
        reinitialiser_zoom: () => {
          const newState = executeReinitialiserZoom(state)
          updates = { zoom: newState.zoom, pan: newState.pan }
          saveHistory = false
        },
        ajuster_vue: () => {
          const canvas = canvasRef?.current
          if (canvas) {
            const newState = executeAjusterVue(state, currentFloor.id, canvas.width, canvas.height)
            updates = { zoom: newState.zoom, pan: newState.pan }
            saveHistory = false
          }
        },
        actualiser: () => {
          executeActualiser(state)
          updates = {}
          saveHistory = false
        },
        modifier_etages: () => {
          if (state.contextMenu?.elementId && state.contextMenu?.elementType === 'verticalLink') {
            onEditVerticalLinkFloors?.(state.contextMenu.elementId)
          }
          saveHistory = false
        },
      }
      
      // Exécuter l'action si elle existe
      const handler = actionHandlers[action]
      if (handler) {
        await handler()
      } else {
        console.warn('Action non implémentée:', action)
      }
      
      // Appliquer les modifications
      if (updates !== null) {
        // Toujours fermer le menu après l'action
        const updatesWithClosedMenu = {
          ...updates,
          contextMenu: null,
        }
        updateState(updatesWithClosedMenu, saveHistory, historyLabel)
      } else {
        closeContextMenu()
      }
    },
    [state, currentFloor.id, updateState, closeContextMenu, lastWorldPos, canvasRef]
  )
  
  /**
   * Fermer le menu si clic ailleurs ou Escape
   * NOTE: Utiliser 'click' au lieu de 'mousedown' pour laisser les onClick des boutons se déclencher
   */
  useEffect(() => {
    if (!state.contextMenu?.visible) return
    
    const handleClickOutside = (e: MouseEvent) => {
      // Ne pas fermer si c'est un clic sur un élément du menu
      const target = e.target as HTMLElement
      if (target.closest('[data-context-menu]')) {
        return
      }
      closeContextMenu()
    }
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu()
      }
    }
    
    // Petit délai pour éviter de fermer immédiatement au clic d'ouverture
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 100)
    
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [state.contextMenu, closeContextMenu])
  
  return {
    openContextMenu,
    closeContextMenu,
    executeAction,
    actions,
  }
}
