/**
 * CANVAS REFACTORISÉ - Architecture modulaire professionnelle
 * Composant léger utilisant des hooks spécialisés pour chaque responsabilité
 * 
 * Hooks utilisés :
 * - useCanvasCoordinates : Gestion zoom et conversions coordonnées
 * - useCanvasSelection : Système de sélection complet
 * - useBoxSelection : Sélection par zone
 * - useShapeCreation : Création formes géométriques (drag)
 * - useFreeFormCreation : Création forme libre (point par point)
 * - useElementDrag : Déplacement éléments sélectionnés (Phase 2)
 * - useVertexEdit : Édition vertices de rooms (Phase 2)
 * - useCanvasInteraction : Gestion événements souris
 * - useCanvasRender : Logique de rendu
 */

import { useRef, useEffect, useState, useCallback } from "react"
import type { EditorState, Floor, Point } from "@/core/entities"
import { 
  useCanvasCoordinates,
  useCanvasSelection,
  useBoxSelection,
  useShapeCreation,
  useFreeFormCreation,
  useWallCreation,
  useDoorCreation,
  useVerticalLinkCreation,
  useElementDrag,
  useVertexEdit,
  useVerticalLinkEdit,
  useWallEndpointEdit,
  useCanvasInteraction,
  useCanvasRender
} from "@/features/canvas/hooks"
import { useContextMenu } from "@/shared/hooks"
import { ContextMenu } from "@/shared/components"
import { v4 as uuidv4 } from "uuid"
import { FloorSelectionModal } from "./components/FloorSelectionModal"
import { findRoomForVerticalLink } from "@/core/services"

interface CanvasProps {
  state: EditorState
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, description?: string) => void
  currentFloor: Floor
  onArtworkDoubleClick?: (artworkId: string) => void
  onOpenPropertiesModal?: (type: 'room' | 'artwork' | 'wall' | 'door' | 'verticalLink', id: string) => void
}

export function Canvas({ 
  state, 
  updateState,
  currentFloor,
  onArtworkDoubleClick,
  onOpenPropertiesModal
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // État du modal de sélection d'étages
  const [verticalLinkModal, setVerticalLinkModal] = useState<{
    position: Point
    size: readonly [number, number]
    type: 'stairs' | 'elevator'
    mode: 'create' | 'edit'
    linkId?: string
    currentFloorIds?: string[]
  } | null>(null)
  
  // Hook coordonnées & zoom
  const coordinates = useCanvasCoordinates({
    state,
    canvasRef,
    updateState
  })
  
  // Hook de sélection
  const selection = useCanvasSelection(
    state,
    currentFloor.id,
    updateState,
    {
      tolerance: 10,
      multiSelect: true,
      enableVertexSelection: state.selectedTool === 'select',
      enableSegmentSelection: state.selectedTool === 'select'
    }
  )
  
  // Hook box selection
  const boxSelection = useBoxSelection()
  
  // Hook de création de formes (drag-based: rectangle, circle, triangle, arc)
  const shapeCreation = useShapeCreation({
    tool: state.selectedTool,
    currentFloor,
    onComplete: (polygon) => {
      if (['rectangle', 'circle', 'triangle', 'arc'].includes(state.selectedTool)) {
        const newRoom = {
          id: uuidv4(),
          polygon: polygon
        }
        
        const updatedFloors = state.floors.map(floor =>
          floor.id === currentFloor.id
            ? { ...floor, rooms: [...floor.rooms, newRoom] }
            : floor
        )
        
        updateState({ floors: updatedFloors }, true, `Créer ${state.selectedTool}`)
      }
    }
  })

  // Hook de création de forme libre (point par point: room)
  const freeFormCreation = useFreeFormCreation({
    currentFloor,
    onComplete: (polygon) => {
      const newRoom = {
        id: uuidv4(),
        polygon: polygon
      }
      
      const updatedFloors = state.floors.map(floor =>
        floor.id === currentFloor.id
          ? { ...floor, rooms: [...floor.rooms, newRoom] }
          : floor
      )
      
      updateState({ floors: updatedFloors }, true, 'Créer pièce libre')
      updateState({ selectedTool: 'select' }, false)
    }
  })

  // Hook de création de murs intérieurs (drag-based)
  const wallCreation = useWallCreation({
    currentFloor,
    onComplete: (wall) => {
      const updatedFloors = state.floors.map(floor =>
        floor.id === currentFloor.id
          ? { ...floor, walls: [...floor.walls, wall] }
          : floor
      )
      
      updateState({ floors: updatedFloors }, true, 'Créer mur intérieur')
    }
  })

  // Hook de création de portes (drag-based)
  const doorCreation = useDoorCreation({
    currentFloor,
    onComplete: (door) => {
      const updatedFloors = state.floors.map(floor =>
        floor.id === currentFloor.id
          ? { ...floor, doors: [...floor.doors, door] }
          : floor
      )
      
      updateState({ floors: updatedFloors }, true, 'Créer porte')
    }
  })

  // Hook de création de liens verticaux (escaliers/ascenseurs)
  const verticalLinkCreation = useVerticalLinkCreation({
    currentFloor,
    onComplete: (position, size, type) => {
      // Ouvrir le modal de sélection d'étages
      setVerticalLinkModal({ position, size, type, mode: 'create' })
    }
  })

  // Hook de déplacement d'éléments (Phase 2)
  const elementDrag = useElementDrag({
    state,
    currentFloor,
    updateState,
    screenToWorld: coordinates.screenToWorld
  })

  // Hook d'édition de vertices (Phase 2)
  const vertexEdit = useVertexEdit({
    state,
    currentFloor,
    updateState,
    screenToWorld: coordinates.screenToWorld
  })

  // Hook d'édition vertices vertical links
  const verticalLinkEdit = useVerticalLinkEdit({
    state,
    currentFloor,
    updateState,
    screenToWorld: coordinates.screenToWorld
  })

  // Hook d'édition endpoints murs
  const wallEndpointEdit = useWallEndpointEdit({
    state,
    currentFloor,
    updateState,
    screenToWorld: coordinates.screenToWorld
  })

  // Callback pour ouvrir le modal d'édition d'étages
  const handleEditVerticalLinkFloors = useCallback((linkId: string) => {
    const link = currentFloor.verticalLinks.find(l => l.id === linkId)
    if (!link) return

    setVerticalLinkModal({
      position: link.position,
      size: link.size,
      type: link.type,
      mode: 'edit',
      linkId: link.id,
      currentFloorIds: [...link.connectedFloorIds]
    })
  }, [currentFloor])

  // Hook du menu contextuel (clic droit)
  const contextMenu = useContextMenu({
    state,
    currentFloor,
    updateState,
    detectElementAt: selection.findElementAt,
    canvasRef,
    onOpenPropertiesModal,
    onEditVerticalLinkFloors: handleEditVerticalLinkFloors
  })

  /**
   * Gestion de la confirmation du modal de sélection d'étages
   */
  const handleVerticalLinkModalConfirm = (selectedFloorIds: string[], createAbove: boolean, createBelow: boolean) => {
    if (!verticalLinkModal) return

    const { position, size, type, mode, linkId } = verticalLinkModal

    // MODE ÉDITION : Mettre à jour les étages connectés
    if (mode === 'edit' && linkId) {
      const updatedFloors = state.floors.map(floor => ({
        ...floor,
        verticalLinks: floor.verticalLinks.map(link =>
          link.id === linkId
            ? { ...link, connectedFloorIds: selectedFloorIds as readonly string[] }
            : link
        )
      }))

      updateState({ floors: updatedFloors }, true, 'Modifier étages connectés')
      setVerticalLinkModal(null)
      return
    }

    // MODE CRÉATION

    // Trouver la room parent
    const room = findRoomForVerticalLink(
      { 
        id: 'temp', 
        type, 
        position, 
        size, 
        floorId: currentFloor.id,
        connectedFloorIds: [] 
      },
      currentFloor
    )

    let updatedFloors = [...state.floors]
    let finalSelectedFloorIds = [...selectedFloorIds]

    // Créer nouvel étage au-dessus si demandé
    if (createAbove) {
      const newFloorId = uuidv4()
      const topFloorIndex = updatedFloors.length - 1
      const newFloor = {
        id: newFloorId,
        name: `Étage ${updatedFloors.length + 1}`,
        rooms: [],
        doors: [],
        walls: [],
        artworks: [],
        verticalLinks: [],
        escalators: [],
        elevators: []
      }
      updatedFloors.push(newFloor)
      finalSelectedFloorIds.push(newFloorId)
    }

    // Créer nouvel étage en-dessous si demandé
    if (createBelow) {
      const newFloorId = uuidv4()
      const newFloor = {
        id: newFloorId,
        name: `Sous-sol ${updatedFloors.filter(f => f.name.startsWith('Sous-sol')).length + 1}`,
        rooms: [],
        doors: [],
        walls: [],
        artworks: [],
        verticalLinks: [],
        escalators: [],
        elevators: []
      }
      updatedFloors.unshift(newFloor)
      finalSelectedFloorIds.push(newFloorId)
    }

    // Créer le nouveau lien vertical (UNIQUEMENT sur l'étage courant)
    const newVerticalLink = {
      id: uuidv4(),
      type,
      position,
      size,
      floorId: currentFloor.id,  // IMPORTANT: lien physique sur cet étage uniquement
      connectedFloorIds: finalSelectedFloorIds,
      roomId: room?.id
    }

    // Ajouter le lien UNIQUEMENT à l'étage courant (pas de duplication visuelle)
    updatedFloors = updatedFloors.map(floor =>
      floor.id === currentFloor.id
        ? { ...floor, verticalLinks: [...floor.verticalLinks, newVerticalLink] }
        : floor
    )

    updateState({ floors: updatedFloors }, true, `Créer ${type === 'stairs' ? 'escalier' : 'ascenseur'}`)
    
    // Fermer le modal
    setVerticalLinkModal(null)
  }

  // Hook d'interaction utilisateur
  const interaction = useCanvasInteraction({
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
    screenToWorld: coordinates.screenToWorld,
    onContextMenu: contextMenu.openContextMenu
  })

  // Hook de rendu
  const { render } = useCanvasRender({
    canvasRef,
    state,
    currentFloor,
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
    wallEndpointEdit,
    hoveredPoint: interaction.hoveredPoint,
    hoverInfo: interaction.hoverInfo
  })

  // Setup canvas et event listeners
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resizeCanvas = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    canvas.addEventListener('wheel', coordinates.handleWheel, { passive: false })

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      canvas.removeEventListener('wheel', coordinates.handleWheel)
    }
  }, [coordinates.handleWheel])

  // Gestion clavier pour vertical link (Échap pour annuler)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (verticalLinkCreation.state.isCreating && e.key === 'Escape') {
        verticalLinkCreation.cancelCreation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [verticalLinkCreation])

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-50" onContextMenu={(e) => e.preventDefault()}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={interaction.handleMouseDown}
        onMouseMove={interaction.handleMouseMove}
        onMouseUp={interaction.handleMouseUp}
        onMouseLeave={interaction.handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full"
        style={{
          cursor: interaction.cursorType === 'grabbing' ? 'grabbing' : 
                  interaction.cursorType === 'grab' ? 'grab' :
                  interaction.cursorType === 'crosshair' ? 'crosshair' : 'default',
          pointerEvents: state.contextMenu ? 'none' : 'auto'
        }}
      />

      {/* Indicateur de l'outil en cours */}
      <div className="absolute bottom-4 left-4 px-3 py-2 bg-gray-900/90 text-white text-sm rounded-lg shadow-lg">
        {/* Mode Drag actif */}
        {elementDrag.dragState.isDragging ? (
          <div className="flex flex-col gap-1">
            <div className="font-semibold">🚀 Déplacement en cours</div>
            <div className="text-xs text-blue-300">
              {elementDrag.dragState.draggedElements.length} élément{elementDrag.dragState.draggedElements.length > 1 ? 's' : ''} en mouvement
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Relâcher: appliquer • Échap: annuler
            </div>
          </div>
        ) : vertexEdit.editState.isEditing ? (
          <div className="flex flex-col gap-1">
            <div className="font-semibold">
              {vertexEdit.editState.editMode === 'vertex' ? '✏️ Édition vertex' : '✏️ Édition segment'}
            </div>
            {vertexEdit.editState.snapInfo.snapType && (
              <div className="text-xs text-green-300">
                Snap: {vertexEdit.editState.snapInfo.snapType}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Shift: désactiver smart snap • Relâcher: appliquer • Échap: annuler
            </div>
          </div>
        ) : state.selectedTool === 'select' ? (
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Mode : Sélection</div>
            {state.selectedElements.length > 0 && (
              <div className="text-xs text-blue-300">
                {state.selectedElements.length} élément{state.selectedElements.length > 1 ? 's' : ''} sélectionné{state.selectedElements.length > 1 ? 's' : ''}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Clic: sélectionner • Ctrl+Clic: multi-sélection • Drag sélection: déplacer • Drag vide: box
            </div>
          </div>
        ) : state.selectedTool === 'room' ? (
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Mode : Forme libre (pièce)</div>
            {freeFormCreation.state.isCreating && freeFormCreation.state.points.length > 0 && (
              <div className="text-xs text-blue-300">
                {freeFormCreation.state.points.length} point{freeFormCreation.state.points.length > 1 ? 's' : ''} placé{freeFormCreation.state.points.length > 1 ? 's' : ''}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Clic: ajouter point • Double-clic ou Entrée: terminer • Échap: annuler
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Mode : {state.selectedTool}</div>
            {shapeCreation.state.isCreating && (
              <div className="text-xs text-blue-300">• En cours de tracé</div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Drag: créer forme • Échap: annuler
            </div>
          </div>
        )}
      </div>

      {/* Badge d'aide au centre */}
      {state.selectedTool === 'room' && freeFormCreation.state.isCreating && freeFormCreation.state.points.length >= 3 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg shadow-lg animate-pulse">
          Double-clic ou Entrée pour terminer la forme
        </div>
      )}

      {/* Validation inline pour mur en cours de création */}
      {wallCreation.state.isCreating && wallCreation.state.validation && !wallCreation.state.validation.valid && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-lg z-50 ${
          wallCreation.state.validation.severity === 'warning' ? 'bg-orange-500' : 'bg-red-500'
        }`}>
          {wallCreation.state.validation.message}
        </div>
      )}

      {/* Validation inline pour lien vertical en cours de création */}
      {verticalLinkCreation.state.isCreating && verticalLinkCreation.state.validationMessage && !verticalLinkCreation.state.isValid && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-lg z-50 ${
          verticalLinkCreation.state.validationSeverity === 'warning' ? 'bg-orange-500' : 'bg-red-500'
        }`}>
          {verticalLinkCreation.state.validationMessage}
        </div>
      )}

      {/* Validation inline pour drag de vertical link */}
      {elementDrag.dragState.isDragging && elementDrag.dragState.draggedElements.some(el => el.type === 'verticalLink') && !elementDrag.dragState.isValid && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg shadow-lg z-50">
          {elementDrag.dragState.validationMessage || 'Déplacement invalide'}
        </div>
      )}

      {/* Validation inline pour édition vertex vertical link */}
      {verticalLinkEdit.editState.isEditing && !verticalLinkEdit.editState.isValid && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg shadow-lg z-50">
          {verticalLinkEdit.editState.validationMessage || 'Modification invalide'}
        </div>
      )}

      {/* Menu contextuel (clic droit) */}
      {state.contextMenu && (
        <ContextMenu
          x={state.contextMenu.x}
          y={state.contextMenu.y}
          actions={contextMenu.actions}
          onAction={contextMenu.executeAction}
          onClose={contextMenu.closeContextMenu}
        />
      )}

      {/* Modal de sélection d'étages pour liens verticaux */}
      {verticalLinkModal && (
        <FloorSelectionModal
          floors={state.floors}
          currentFloorId={currentFloor.id}
          linkType={verticalLinkModal.type}
          mode={verticalLinkModal.mode}
          currentConnectedFloorIds={verticalLinkModal.currentFloorIds}
          onConfirm={handleVerticalLinkModalConfirm}
          onCancel={() => setVerticalLinkModal(null)}
        />
      )}
    </div>
  )
}
