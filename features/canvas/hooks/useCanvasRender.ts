/**
 * Hook pour gérer le rendu du canvas
 * Centralise toute la logique de dessin pour un Canvas plus léger
 */

import { useCallback, useRef, useEffect } from "react"
import type { EditorState, Floor, Point, HoverInfo } from "@/core/entities"
import {
  drawGrid,
  drawRoom,
  drawWall,
  drawWallPreview,
  drawArtwork,
  drawDoor,
  drawDoorPreview,
  drawSharedWalls,
  drawDoorCreationGuides,
  drawVerticalLink,
  drawVerticalLinkPreview,
  drawShapePreview,
  drawSnapPoint,
  drawValidationMessage,
  drawBoxSelection,
  drawRoomVertices,
  drawRoomSegments,
  drawWallVertices,
  drawMeasurement,
  drawAreaMeasurement
} from "@/features/canvas/utils"
import { drawVerticalLinkVertices } from "@/features/canvas/utils/vertical-link-vertex.renderer"
import { validateWallPlacement } from "@/core/services"
import { worldToCanvas } from "@/core/utils"
import { GRID_SIZE } from "@/core/constants"

interface CanvasRenderOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>
  state: EditorState
  currentFloor: Floor
  selection: any
  shapeCreation: any
  freeFormCreation: any
  wallCreation: any
  doorCreation: any
  verticalLinkCreation: any
  boxSelection: any
  elementDrag: any
  vertexEdit: any
  verticalLinkEdit: any
  wallEndpointEdit: any
  hoveredPoint: Point | null
  hoverInfo: HoverInfo | null
}

export function useCanvasRender({
  canvasRef,
  state,
  currentFloor,
  selection,
  shapeCreation,
  freeFormCreation,
  doorCreation,
  wallCreation,
  verticalLinkCreation,
  boxSelection,
  elementDrag,
  vertexEdit,
  verticalLinkEdit,
  wallEndpointEdit,
  hoveredPoint,
  hoverInfo
}: CanvasRenderOptions) {
  const animationFrameRef = useRef<number>(0)

  /**
   * Fonction de rendu complète du canvas
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // 1. Grille
    drawGrid(ctx, width, height, state.zoom, state.pan)

    // 2. Éléments du floor
    renderFloorElements(ctx, currentFloor, state, selection, hoverInfo, elementDrag, verticalLinkEdit)

    // 2.5. Mesures (si activées)
    if (state.measurements.showMeasurements) {
      renderMeasurements(ctx, currentFloor, state, selection)
    }

    // 3. Feedback visuel drag/edit (NOUVEAU)
    renderDragFeedback(ctx, canvas, elementDrag, vertexEdit, wallEndpointEdit, state)

    // 3.5. Feedback duplication invalide
    if (state.duplicatingElement && !state.duplicatingElement.isValid && state.duplicatingElement.validationMessage) {
      drawValidationMessage(
        ctx,
        state.duplicatingElement.validationMessage,
        'error',
        { x: canvas.width / 2, y: 50 }
      )
    }

    // 4. Prévisualisations de création
    renderCreationPreviews(ctx, canvas, state, shapeCreation, freeFormCreation, wallCreation, doorCreation, verticalLinkCreation)

    // 5. Box selection
    renderBoxSelection(ctx, boxSelection, state)

    // 6. Point hover (snap indicator)
    if (hoveredPoint && !shapeCreation.state.isCreating && !freeFormCreation.state.isCreating && !boxSelection.state.isActive && state.selectedTool !== 'select') {
      drawSnapPoint(ctx, hoveredPoint, state.zoom, state.pan, true)
    }

    // 7. Vertices et segments (mode select uniquement)
    if (state.selectedTool === 'select') {
      renderVerticesAndSegments(ctx, currentFloor, state, hoverInfo)
    }

    // Animation continue
    animationFrameRef.current = requestAnimationFrame(render)
  }, [
    state.zoom,
    state.pan,
    state.selectedTool,
    state.selectedElements,
    currentFloor,
    selection,
    shapeCreation.state,
    freeFormCreation.state,
    boxSelection.state,
    elementDrag.dragState,
    vertexEdit.editState,
    hoveredPoint,
    hoverInfo
  ])

  /**
   * Démarrer/arrêter l'animation
   */
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(render)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [render])

  return { render }
}

/**
 * Rendu des éléments du floor (rooms, walls, doors, etc.)
 */
function renderFloorElements(
  ctx: CanvasRenderingContext2D,
  currentFloor: Floor,
  state: EditorState,
  selection: any,
  hoverInfo: any,
  elementDrag: any,
  verticalLinkEdit: any
) {
  currentFloor.rooms.forEach(room => {
    const isSelected = selection.isSelected('room', room.id)
    const isDuplicating = state.duplicatingElement?.elementId === room.id && state.duplicatingElement?.elementType === 'room'
    const isValidDuplication = state.duplicatingElement?.isValid ?? true
    drawRoom(ctx, room, state.zoom, state.pan, isSelected, false, true, isDuplicating, isValidDuplication)
  })

  currentFloor.walls?.forEach(wall => {
    const isSelected = selection.isSelected('wall', wall.id)
    const isHovered = selection.hoverInfo?.type === 'wall' && selection.hoverInfo?.id === wall.id
    const isDuplicating = state.duplicatingElement?.elementId === wall.id && state.duplicatingElement?.elementType === 'wall'
    const isValidDuplication = state.duplicatingElement?.isValid ?? true
    
    // Si en duplication, afficher avec feedback visuel
    if (isDuplicating) {
      drawWall(ctx, wall, state.zoom, state.pan, true, false, state.measurements.showMeasurements)
      // Ajouter un overlay de couleur
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = isValidDuplication ? '#22c55e' : '#ef4444'
      ctx.lineWidth = 8
      const start = worldToCanvas(wall.segment[0], state.zoom, state.pan)
      const end = worldToCanvas(wall.segment[1], state.zoom, state.pan)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      ctx.restore()
    } else {
      drawWall(ctx, wall, state.zoom, state.pan, isSelected, isHovered, state.measurements.showMeasurements)
    }
  })

  currentFloor.doors?.forEach(door => {
    const isSelected = selection.isSelected('door', door.id)
    drawDoor(ctx, door, state.zoom, state.pan, GRID_SIZE, isSelected, false, false)
  })

  currentFloor.artworks?.forEach(artwork => {
    const isSelected = selection.isSelected('artwork', artwork.id)
    const isDuplicating = state.duplicatingElement?.elementId === artwork.id && state.duplicatingElement?.elementType === 'artwork'
    const isValidDuplication = state.duplicatingElement?.isValid ?? true
    drawArtwork(ctx, artwork, state.zoom, state.pan, isSelected, false, isDuplicating, isValidDuplication)
  })

  currentFloor.verticalLinks?.forEach(link => {
    const isSelected = selection.isSelected('verticalLink', link.id)
    const isHovered = hoverInfo?.type === 'verticalLink' && hoverInfo?.id === link.id
    
    // Vérifier si c'est en cours de drag invalide ou édition invalide
    const isDragging = elementDrag.dragState.isDragging && 
                       elementDrag.dragState.draggedElements.some(el => el.type === 'verticalLink' && el.id === link.id)
    const isResizing = verticalLinkEdit.editState.isResizing && verticalLinkEdit.editState.linkId === link.id
    const isInvalid = (isDragging && !elementDrag.dragState.isValid) || 
                      (isResizing && !verticalLinkEdit.editState.isValid)
    
    drawVerticalLink(ctx, link, state.zoom, state.pan, GRID_SIZE, isSelected, isHovered, isInvalid, currentFloor.id)
  })
}

/**
 * Rendu des prévisualisations de création
 */
function renderCreationPreviews(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: EditorState,
  shapeCreation: any,
  freeFormCreation: any,
  wallCreation?: any,
  doorCreation?: any,
  verticalLinkCreation?: any
) {
  // Preview formes géométriques (drag)
  if (shapeCreation.state.previewPolygon) {
    drawShapePreview(ctx, {
      polygon: shapeCreation.state.previewPolygon,
      isValid: shapeCreation.state.isValid,
      validationSeverity: shapeCreation.state.validationSeverity,
      zoom: state.zoom,
      pan: state.pan,
      showVertices: true,
      animationPhase: Date.now() / 50
    })
    
    if (shapeCreation.state.validationMessage && !shapeCreation.state.isValid) {
      drawValidationMessage(
        ctx,
        shapeCreation.state.validationMessage,
        shapeCreation.state.validationSeverity || 'error',
        { x: canvas.width / 2, y: 50 }
      )
    }
  }

  // Preview forme libre (point par point)
  if (freeFormCreation.state.isCreating && freeFormCreation.state.points.length > 0) {
    const previewPolygon = [...freeFormCreation.state.points]
    
    if (freeFormCreation.state.hoverPoint) {
      previewPolygon.push(freeFormCreation.state.hoverPoint)
    }

    if (previewPolygon.length >= 2) {
      drawShapePreview(ctx, {
        polygon: previewPolygon,
        isValid: freeFormCreation.state.isValid,
        validationSeverity: freeFormCreation.state.validationSeverity,
        zoom: state.zoom,
        pan: state.pan,
        showVertices: true,
        animationPhase: Date.now() / 50
      })
    }

    // Dessiner les points existants
    freeFormCreation.state.points.forEach((point: Point, index: number) => {
      ctx.save()
      ctx.translate(point.x * state.zoom + state.pan.x, point.y * state.zoom + state.pan.y)
      
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, Math.PI * 2)
      ctx.fillStyle = index === 0 ? '#3b82f6' : '#22c55e'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      
      ctx.restore()
    })

    if (freeFormCreation.state.validationMessage) {
      drawValidationMessage(
        ctx,
        freeFormCreation.state.validationMessage,
        freeFormCreation.state.validationSeverity || 'info',
        { x: canvas.width / 2, y: 50 }
      )
    }
  }

  // Preview mur intérieur (drag)
  if (wallCreation?.state.previewWall) {
    // Valider le mur en temps réel
    const currentFloor = state.floors.find((f: any) => f.id === state.currentFloorId)
    const validation = currentFloor ? validateWallPlacement(wallCreation.state.previewWall, {
      floor: currentFloor
    }) : { valid: false, message: 'Floor not found' }
    
    drawWallPreview(
      ctx,
      wallCreation.state.previewWall,
      state.zoom,
      state.pan,
      validation
    )
  }

  // Preview porte (drag) - Mode door actif
  if (state.selectedTool === 'door' && doorCreation) {
    // Afficher les murs partagés (segments où on peut placer des portes)
    if (doorCreation.sharedWalls && doorCreation.sharedWalls.length > 0) {
      drawSharedWalls(
        ctx,
        doorCreation.sharedWalls,
        state.zoom,
        state.pan,
        doorCreation.state.selectedWall
      )
    }

    // Afficher les guides pendant la création
    if (doorCreation.state.isCreating && doorCreation.state.selectedWall && doorCreation.state.currentPoint) {
      drawDoorCreationGuides(
        ctx,
        doorCreation.state.selectedWall,
        doorCreation.state.currentPoint,
        state.zoom,
        state.pan
      )
    }

    // Afficher la preview de la porte
    if (doorCreation.state.previewDoor) {
      drawDoorPreview(
        ctx,
        doorCreation.state.previewDoor,
        state.zoom,
        state.pan,
        40, // GRID_SIZE
        doorCreation.state.isValid
      )

      // Message de validation
      if (doorCreation.state.validationMessage) {
        drawValidationMessage(
          ctx,
          doorCreation.state.validationMessage,
          doorCreation.state.isValid ? 'info' : 'error',
          { x: canvas.width / 2, y: 50 }
        )
      }
    }
  }

  // Preview lien vertical (escalier/ascenseur)
  if (verticalLinkCreation && verticalLinkCreation.state.isCreating) {
    drawVerticalLinkPreview(
      ctx,
      verticalLinkCreation.state.startPoint,
      verticalLinkCreation.state.currentPoint,
      verticalLinkCreation.state.type || 'stairs',
      state.zoom,
      state.pan,
      verticalLinkCreation.state.isValid
    )

    // Message de validation
    if (verticalLinkCreation.state.validationMessage && !verticalLinkCreation.state.isValid) {
      drawValidationMessage(
        ctx,
        verticalLinkCreation.state.validationMessage,
        verticalLinkCreation.state.validationSeverity || 'error',
        { x: canvas.width / 2, y: 50 }
      )
    }
  }
}

/**
 * Rendu de la box selection
 */
function renderBoxSelection(
  ctx: CanvasRenderingContext2D,
  boxSelection: any,
  state: EditorState
) {
  if (boxSelection.state.isActive && boxSelection.state.startPoint && boxSelection.state.currentPoint) {
    drawBoxSelection(
      ctx,
      boxSelection.state.startPoint,
      boxSelection.state.currentPoint,
      state.zoom,
      state.pan
    )
  }
}

/**
 * Rendu des vertices et segments (mode select)
 */
function renderVerticesAndSegments(
  ctx: CanvasRenderingContext2D,
  currentFloor: Floor,
  state: EditorState,
  hoverInfo: HoverInfo | null
) {
  // VERTICES ET SEGMENTS DES ROOMS
  currentFloor.rooms.forEach(room => {
    // Segments (overlay quand hover ou selected)
    drawRoomSegments(ctx, room, state.pan, state.zoom, hoverInfo, state.selectedElements)
    
    // Vertices (toujours affichés)
    drawRoomVertices(ctx, room, state.pan, state.zoom, hoverInfo, state.selectedElements)
  })
  
  // VERTICES DES MURS (avec hover orange et sélection)
  currentFloor.walls?.forEach(wall => {
    drawWallVertices(ctx, wall, state.pan, state.zoom, hoverInfo, state.selectedElements)
  })
  
  // VERTICES DES VERTICAL LINKS (rectangles éditables)
  if (currentFloor.verticalLinks) {
    currentFloor.verticalLinks.forEach(link => {
      if (link.floorId === currentFloor.id) {
        drawVerticalLinkVertices(ctx, link, state.pan, state.zoom, hoverInfo, state.selectedElements)
      }
    })
  }
}

/**
 * Rendu des mesures (longueur segments + superficie)
 */
function renderMeasurements(
  ctx: CanvasRenderingContext2D,
  currentFloor: Floor,
  state: EditorState,
  selection: any
) {
  // Afficher mesures de TOUTES les pièces
  currentFloor.rooms.forEach(room => {
    if (room.polygon.length < 3) return

    const isSelected = selection.isSelected('room', room.id)

    // 1. Mesures de chaque segment (longueur en mètres) - Highlight si sélectionné
    for (let i = 0; i < room.polygon.length; i++) {
      const start = room.polygon[i]
      const end = room.polygon[(i + 1) % room.polygon.length]
      
      drawMeasurement(
        ctx,
        start,
        end,
        state.zoom,
        state.pan,
        GRID_SIZE,
        isSelected  // Highlight bleu si sélectionné
      )
    }

    // 2. Superficie au centre - Highlight si sélectionné
    drawAreaMeasurement(
      ctx,
      room,
      state.zoom,
      state.pan,
      GRID_SIZE,
      isSelected  // Highlight vert si sélectionné
    )
  })
}

/**
 * Rendu du feedback visuel pendant drag/edit (NOUVEAU)
 */
function renderDragFeedback(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  elementDrag: any,
  vertexEdit: any,
  wallEndpointEdit: any,
  state: EditorState
) {
  // Feedback drag éléments
  if (elementDrag.dragState.isDragging && !elementDrag.dragState.isValid) {
    // Overlay rouge semi-transparent sur éléments invalides
    ctx.save()
    ctx.fillStyle = 'rgba(220, 38, 38, 0.15)'
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)'
    ctx.lineWidth = 2  // Épaisseur constante (en pixels écran)
    
    // Dessiner contour rouge autour des éléments en drag
    elementDrag.dragState.draggedElements.forEach((selected: any) => {
      const floor = state.floors.find(f => f.id === state.currentFloorId)
      if (!floor) return
      
      if (selected.type === 'room') {
        const room = floor.rooms.find(r => r.id === selected.id)
        if (room) {
          ctx.beginPath()
          room.polygon.forEach((point, i) => {
            const screenX = point.x * state.zoom + state.pan.x
            const screenY = point.y * state.zoom + state.pan.y
            if (i === 0) ctx.moveTo(screenX, screenY)
            else ctx.lineTo(screenX, screenY)
          })
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      }
    })
    ctx.restore()
    
    // Message d'erreur
    if (elementDrag.dragState.validationMessage) {
      drawValidationMessage(
        ctx,
        elementDrag.dragState.validationMessage,
        'error',
        { x: canvas.width / 2, y: 50 }
      )
    }
  }
  
  // Feedback édition vertex
  if (vertexEdit.editState.isEditing) {
    // Overlay rouge si invalide
    if (!vertexEdit.editState.isValid && vertexEdit.editState.newPolygon) {
      ctx.save()
      ctx.fillStyle = 'rgba(220, 38, 38, 0.15)'
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)'
      ctx.lineWidth = 2  // Épaisseur constante (en pixels écran)
      
      ctx.beginPath()
      vertexEdit.editState.newPolygon.forEach((point: Point, i: number) => {
        const screenX = point.x * state.zoom + state.pan.x
        const screenY = point.y * state.zoom + state.pan.y
        if (i === 0) ctx.moveTo(screenX, screenY)
        else ctx.lineTo(screenX, screenY)
      })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      
      // Message d'erreur
      if (vertexEdit.editState.validationMessage) {
        drawValidationMessage(
          ctx,
          vertexEdit.editState.validationMessage,
          'error',
          { x: canvas.width / 2, y: 50 }
        )
      }
    }
  }
  
  // Feedback édition vertex de MUR (wallEndpointEdit)
  if (wallEndpointEdit.editState.isEditing && !wallEndpointEdit.editState.isValid) {
    // Trouver le mur en cours d'édition
    const floor = state.floors.find(f => f.id === state.currentFloorId)
    const wall = floor?.walls?.find(w => w.id === wallEndpointEdit.editState.wallId)
    
    if (wall && wallEndpointEdit.editState.newPath) {
      ctx.save()
      
      // Dessiner le path en ROUGE
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)'
      ctx.lineWidth = 6
      
      ctx.beginPath()
      wallEndpointEdit.editState.newPath.forEach((point: Point, i: number) => {
        const screenX = point.x * state.zoom + state.pan.x
        const screenY = point.y * state.zoom + state.pan.y
        if (i === 0) ctx.moveTo(screenX, screenY)
        else ctx.lineTo(screenX, screenY)
      })
      ctx.stroke()
      ctx.restore()
      
      // Message d'erreur
      if (wallEndpointEdit.editState.validationMessage) {
        drawValidationMessage(
          ctx,
          wallEndpointEdit.editState.validationMessage,
          'error',
          { x: canvas.width / 2, y: 50 }
        )
      }
    }
  }
}

