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
  drawArtwork,
  drawDoor,
  drawVerticalLink,
  drawShapePreview,
  drawSnapPoint,
  drawValidationMessage,
  drawBoxSelection,
  drawRoomVertices,
  drawRoomSegments
} from "@/features/canvas/utils"
import { GRID_SIZE } from "@/core/constants"

interface CanvasRenderOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>
  state: EditorState
  currentFloor: Floor
  selection: any
  shapeCreation: any
  freeFormCreation: any
  boxSelection: any
  elementDrag: any
  vertexEdit: any
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
  boxSelection,
  elementDrag,
  vertexEdit,
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
    renderFloorElements(ctx, currentFloor, state, selection)

    // 3. Feedback visuel drag/edit (NOUVEAU)
    renderDragFeedback(ctx, canvas, elementDrag, vertexEdit, state)

    // 4. Prévisualisations de création
    renderCreationPreviews(ctx, canvas, state, shapeCreation, freeFormCreation)

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
  selection: any
) {
  currentFloor.rooms.forEach(room => {
    const isSelected = selection.isSelected('room', room.id)
    drawRoom(ctx, room, state.zoom, state.pan, isSelected, false)
  })

  currentFloor.walls?.forEach(wall => {
    const isSelected = selection.isSelected('wall', wall.id)
    drawWall(ctx, wall, state.zoom, state.pan, isSelected, false)
  })

  currentFloor.doors?.forEach(door => {
    const isSelected = selection.isSelected('door', door.id)
    drawDoor(ctx, door, state.zoom, state.pan, GRID_SIZE, isSelected, false, false)
  })

  currentFloor.artworks?.forEach(artwork => {
    const isSelected = selection.isSelected('artwork', artwork.id)
    drawArtwork(ctx, artwork, state.zoom, state.pan, isSelected, false)
  })

  currentFloor.verticalLinks?.forEach(link => {
    const isSelected = selection.isSelected('verticalLink', link.id)
    drawVerticalLink(ctx, link, state.zoom, state.pan, GRID_SIZE, isSelected, false, false)
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
  freeFormCreation: any
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
  currentFloor.rooms.forEach(room => {
    // Segments (overlay quand hover ou selected)
    drawRoomSegments(ctx, room, state.pan, state.zoom, hoverInfo, state.selectedElements)
    
    // Vertices (toujours affichés)
    drawRoomVertices(ctx, room, state.pan, state.zoom, hoverInfo, state.selectedElements)
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
}

