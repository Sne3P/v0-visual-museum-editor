"use client"

import type React from "react"
import { useRef, useCallback, useState, useEffect } from "react"
import type { EditorState, Floor, Point, Room, Artwork, Door, VerticalLink, HoverInfo, DragInfo, Wall, SelectionInfo } from "@/lib/types"
import {
  snapToGrid,
  isPointInPolygon,
  snapToWallSegmentWithPosition,
  polygonsIntersect,
  segmentsIntersect,
  createCirclePolygon,
  createTrianglePolygon,
  createArcPolygon,
  rectangleOverlapsRooms,
  isWallSegmentOccupied,
  calculateWallSegment,
  findWallSegmentForElement,
  moveElementWithWall,
  isElementInRoom,
  projectPointOntoSegment,
  isArtworkInRoom,
  getArtworkResizeHandle,
  calculateBounds,
  calculateDistanceInMeters,
  getSegmentMidpoint,
  getPerpendicularDirection,
  getPolygonCenter,
  checkPolygonsOverlapIntelligent,
} from "@/lib/geometry"
import {
  createWall,
  createWallInRoom,
  validateWallPlacement,
  findWallSnapPoints,
  findRoomContainingSegment,
  findElementsAttachedToWall,
  findRoomWallSnapPoint,
  updateWallsAttachedToRoom,
  WALL_THICKNESS,
  projectPointOnWallSegment,
  calculateElementSegmentOnWall,
  findParentWall,
} from "@/lib/walls"
import { 
  GRID_SIZE, 
  MAJOR_GRID_INTERVAL, 
  COLORS, 
  STROKE_WIDTHS, 
  VERTEX_RADIUS, 
  ENDPOINT_RADIUS,
  VERTEX_HIT_RADIUS,
  ENDPOINT_HIT_RADIUS,
  LINE_HIT_THRESHOLD,
  CONSTRAINTS,
  VISUAL_FEEDBACK,
  MEASUREMENT_OFFSET,
  FONTS
} from "@/lib/constants"
import { useRenderOptimization, useThrottle } from "@/lib/hooks"
import { useKeyboardShortcuts, getInteractionCursor, calculateSmoothZoom } from "@/lib/interactions"
import { validateRoom, validateArtwork, validateDoor, validateVerticalLink, validateRoomGeometry, validateArtworkPlacement } from "@/lib/validation"
import { quickCoherenceCheck } from "@/lib/global-coherence"
import { findSnapPoints, type SnapPoint } from "@/lib/snap"
import { ContextMenu } from "./context-menu"

// Fonction utilitaire pour vérifier si un élément est sélectionné
const isElementSelected = (elementId: string, elementType: string, selectedElements: ReadonlyArray<SelectionInfo>) => {
  return selectedElements.some(sel => sel.id === elementId && sel.type === elementType)
}

// Fonctions utilitaires pour feedback visuel unifié
const getValidationColor = (isValid: boolean, opacity: number = 1): string => {
  const baseColor = isValid ? VISUAL_FEEDBACK.colors.valid : VISUAL_FEEDBACK.colors.invalid
  const rgbMatch = baseColor.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 16)
    const g = parseInt(rgbMatch[2], 16)
    const b = parseInt(rgbMatch[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return baseColor
}

const getCreationPreviewColor = (isValid: boolean, opacity: number = VISUAL_FEEDBACK.opacity.preview): string => {
  return getValidationColor(isValid, opacity)
}

const getActionColor = (action: 'creating' | 'moving' | 'resizing', opacity: number = 1): string => {
  const baseColor = VISUAL_FEEDBACK.colors[action]
  const rgbMatch = baseColor.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 16)
    const g = parseInt(rgbMatch[2], 16)
    const b = parseInt(rgbMatch[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return baseColor
}

interface CanvasProps {
  state: EditorState
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, actionDescription?: string) => void
  updateStateTemporary?: (updates: Partial<EditorState>) => void
  saveToHistory?: (newState: EditorState, actionDescription?: string) => void
  currentFloor: Floor
  onNavigateToFloor?: (floorId: string) => void
  onRecenter?: () => void
  onArtworkDoubleClick?: (artworkId: string) => void
}

export function Canvas({ 
  state, 
  updateState, 
  updateStateTemporary, 
  saveToHistory, 
  currentFloor, 
  onNavigateToFloor,
  onArtworkDoubleClick 
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Helper pour mise à jour intelligente
  const smartUpdate = useCallback((updates: Partial<EditorState>, actionType: 'temporary' | 'final', description?: string) => {
    if (actionType === 'temporary' && updateStateTemporary) {
      updateStateTemporary(updates)
    } else if (actionType === 'final') {
      updateState(updates, true, description)
    } else {
      updateState(updates)
    }
  }, [updateState, updateStateTemporary])

  // Version simple pour actions finales avec description automatique
  const finalizeAction = useCallback((updates: Partial<EditorState>, description: string) => {
    smartUpdate(updates, 'final', description)
  }, [smartUpdate])

  // État pour capturer les actions en cours
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null)
  const [isValidPlacement, setIsValidPlacement] = useState(true)
  const [drawStartPoint, setDrawStartPoint] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [selectionBox, setSelectionBox] = useState<{
    start: Point
    end: Point
  } | null>(null)

  const [dragStartState, setDragStartState] = useState<{
    type: "vertex" | "room" | "door" | "verticalLink" | "artwork" | "wall"
    originalData: any
  } | null>(null)

  const [draggedVertex, setDraggedVertex] = useState<{ roomId: string; vertexIndex: number } | null>(null)
  const [draggedRoom, setDraggedRoom] = useState<{ roomId: string; startPos: Point; roomStartPos: Point } | null>(null)
  const [draggedWall, setDraggedWall] = useState<{ wallId: string; startPos: Point; wallStartPos: Point } | null>(null)
  const [draggedElement, setDraggedElement] = useState<{
    type: "door" | "verticalLink" | "wall"
    id: string
    endpoint: "start" | "end"
  } | null>(null)

  const [draggedArtwork, setDraggedArtwork] = useState<{
    artworkId: string
    startPos: Point
    artworkStartPos: [number, number]
  } | null>(null)

  const [resizingArtwork, setResizingArtwork] = useState<{
    artworkId: string
    handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"
    startPos: Point
    originalArtwork: Artwork
  } | null>(null)

  const [attachedWallSegment, setAttachedWallSegment] = useState<{
    segmentStart: Point
    segmentEnd: Point
  } | null>(null)

  const [hoveredElement, setHoveredElement] = useState<{
    type: "room" | "door" | "verticalLink" | "artwork" | "wall" | "vertex" | "doorEndpoint" | "linkEndpoint" | "wallEndpoint"
    id: string
    vertexIndex?: number
    endpoint?: "start" | "end"
  } | null>(null)

  const [wallSegmentSnap, setWallSegmentSnap] = useState<{
    point: Point
    segmentStart: Point
    segmentEnd: Point
  } | null>(null)
  const [creationPreview, setCreationPreview] = useState<{
    start: Point
    end: Point
    valid: boolean
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: "background" | "room" | "door" | "verticalLink" | "artwork" | "wall"
    elementId?: string
  } | null>(null)

  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [coherenceStatus, setCoherenceStatus] = useState<{
    isValid: boolean
    issuesCount: number
  }>({ isValid: true, issuesCount: 0 })

  const GRID_SIZE = 40
  const MAJOR_GRID_INTERVAL = 5

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const x = (screenX - rect.left - state.pan.x) / state.zoom
      const y = (screenY - rect.top - state.pan.y) / state.zoom
      return { x, y }
    },
    [state.pan, state.zoom],
  )

  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point => {
      return {
        x: worldX * state.zoom + state.pan.x,
        y: worldY * state.zoom + state.pan.y,
      }
    },
    [state.pan, state.zoom],
  )

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const gridSize = GRID_SIZE * state.zoom
      const startX = Math.floor(-state.pan.x / gridSize) * gridSize + state.pan.x
      const startY = Math.floor(-state.pan.y / gridSize) * gridSize + state.pan.y

      for (let x = startX; x < width; x += gridSize) {
        const gridX = Math.round((x - state.pan.x) / gridSize)
        const isMajor = gridX % MAJOR_GRID_INTERVAL === 0
        ctx.strokeStyle = isMajor ? "rgb(212, 212, 212)" : "rgb(229, 229, 229)"
        ctx.lineWidth = isMajor ? 1.5 : 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }

      for (let y = startY; y < height; y += gridSize) {
        const gridY = Math.round((y - state.pan.y) / gridSize)
        const isMajor = gridY % MAJOR_GRID_INTERVAL === 0
        ctx.strokeStyle = isMajor ? "rgb(212, 212, 212)" : "rgb(229, 229, 229)"
        ctx.lineWidth = isMajor ? 1.5 : 1
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
    },
    [state.pan, state.zoom],
  )

  // Fonction pour dessiner les mesures de distances
  const drawMeasurement = useCallback((
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    distance: number,
    isDynamic: boolean = false,
    isHighlighted: boolean = false
  ) => {
    const startScreen = worldToScreen(start.x * GRID_SIZE, start.y * GRID_SIZE)
    const endScreen = worldToScreen(end.x * GRID_SIZE, end.y * GRID_SIZE)
    const midpoint = getSegmentMidpoint(startScreen, endScreen)
    const perpDirection = getPerpendicularDirection(startScreen, endScreen)
    
    // Position du label
    const labelOffset = MEASUREMENT_OFFSET * Math.max(0.8, Math.min(1.5, state.zoom))
    const labelPos = {
      x: midpoint.x + perpDirection.x * labelOffset,
      y: midpoint.y + perpDirection.y * labelOffset
    }
    
    // Texte de mesure
    const measureText = `${distance.toFixed(2)}m`
    
    // Taille de police adaptative au zoom (entre 10px et 18px - plus gros)
    const fontSize = Math.max(10, Math.min(18, (FONTS.measurementSize + 2) * Math.pow(state.zoom, 0.3)))
    
    // Style du texte
    ctx.font = `${fontSize}px ${FONTS.measurementFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Si c'est en surbrillance (forme sélectionnée), ajouter un fond
    if (isHighlighted) {
      const textMetrics = ctx.measureText(measureText)
      const padding = 4 * Math.max(0.8, Math.min(1.2, state.zoom))
      const bgWidth = textMetrics.width + padding * 2
      const bgHeight = fontSize + padding * 2
      
      // Fond pour la surbrillance
      ctx.fillStyle = COLORS.measurementBackground
      ctx.strokeStyle = COLORS.measurementBorder
      ctx.lineWidth = 1.5
      
      ctx.fillRect(
        labelPos.x - bgWidth / 2,
        labelPos.y - bgHeight / 2,
        bgWidth,
        bgHeight
      )
      ctx.strokeRect(
        labelPos.x - bgWidth / 2,
        labelPos.y - bgHeight / 2,
        bgWidth,
        bgHeight
      )
    }
    
    // Texte de mesure avec couleur adaptée
    if (isDynamic) {
      ctx.fillStyle = COLORS.validStroke
    } else if (isHighlighted) {
      ctx.fillStyle = COLORS.measurementText
    } else {
      // Texte simple, couleur adaptée au contraste
      ctx.fillStyle = state.zoom > 1.5 ? COLORS.measurementText : "#666666"
    }
    
    ctx.fillText(measureText, labelPos.x, labelPos.y)
  }, [worldToScreen, state.zoom])

  // Fonction pour dessiner la surface d'une pièce
  const drawAreaMeasurement = useCallback((
    ctx: CanvasRenderingContext2D,
    room: Room,
    area: number,
    isHighlighted: boolean = false
  ) => {
    const center = getPolygonCenter(room.polygon)
    const centerScreen = worldToScreen(center.x * GRID_SIZE, center.y * GRID_SIZE)
    
    // Texte de surface
    const areaText = `${area.toFixed(2)} m²`
    
    // Taille de police adaptative au zoom (entre 11px et 20px pour les surfaces - plus gros)
    const fontSize = Math.max(11, Math.min(20, (FONTS.measurementSize + 4) * Math.pow(state.zoom, 0.3)))
    
    // Style du texte
    ctx.font = `bold ${fontSize}px ${FONTS.measurementFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Si c'est en surbrillance (forme sélectionnée), ajouter un fond
    if (isHighlighted) {
      const textMetrics = ctx.measureText(areaText)
      const padding = 6 * Math.max(0.8, Math.min(1.3, state.zoom))
      const bgWidth = textMetrics.width + padding * 2
      const bgHeight = fontSize + padding * 2
      
      // Fond coloré pour les surfaces sélectionnées
      ctx.fillStyle = COLORS.areaBackground
      ctx.strokeStyle = COLORS.areaText
      ctx.lineWidth = 2
      
      ctx.fillRect(
        centerScreen.x - bgWidth / 2,
        centerScreen.y - bgHeight / 2,
        bgWidth,
        bgHeight
      )
      ctx.strokeRect(
        centerScreen.x - bgWidth / 2,
        centerScreen.y - bgHeight / 2,
        bgWidth,
        bgHeight
      )
      
      // Texte avec couleur forte pour la sélection
      ctx.fillStyle = COLORS.areaText
    } else {
      // Texte simple sans fond, couleur adaptée au zoom
      ctx.fillStyle = state.zoom > 1.2 ? COLORS.areaText : "#0d9488"
    }
    
    ctx.fillText(areaText, centerScreen.x, centerScreen.y)
  }, [worldToScreen, state.zoom])

  // Fonction pour dessiner l'échelle dynamique
  const drawScale = useCallback((ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    // Position adaptative : ajuster selon la taille de l'écran
    const isMobile = canvasWidth < 768
    const scaleX = canvasWidth - (isMobile ? 90 : 120)
    const scaleY = canvasHeight - (isMobile ? 40 : 50)
    
    // Calculer une distance appropriée pour l'échelle en fonction du zoom
    // Plus on dézoome, plus l'échelle représente une grande distance
    const baseLength = isMobile ? 60 : 80 // pixels pour l'échelle, plus court sur mobile
    const gridUnitsLength = baseLength / (GRID_SIZE * state.zoom)
    const metersLength = gridUnitsLength * 0.5 // 1 grid unit = 0.5m
    
    // Arrondir à une valeur lisible (1, 2, 5, 10, 20, 50, etc.)
    let roundedMeters: number
    if (metersLength < 1) {
      roundedMeters = Math.ceil(metersLength * 10) / 10
    } else if (metersLength < 5) {
      roundedMeters = Math.ceil(metersLength)
    } else if (metersLength < 10) {
      roundedMeters = Math.ceil(metersLength / 5) * 5
    } else if (metersLength < 50) {
      roundedMeters = Math.ceil(metersLength / 10) * 10
    } else {
      roundedMeters = Math.ceil(metersLength / 50) * 50
    }
    
    // Calculer la longueur réelle en pixels pour cette distance arrondie
    const actualPixelLength = (roundedMeters / 0.5) * GRID_SIZE * state.zoom
    
    // Fond semi-transparent pour l'échelle
    const padding = isMobile ? 6 : 8
    const scaleWidth = actualPixelLength + padding * 2
    const scaleHeight = isMobile ? 25 : 30
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
    ctx.strokeStyle = "#e5e7eb"
    ctx.lineWidth = 1
    ctx.fillRect(scaleX - padding, scaleY - scaleHeight + padding, scaleWidth, scaleHeight)
    ctx.strokeRect(scaleX - padding, scaleY - scaleHeight + padding, scaleWidth, scaleHeight)
    
    // Dessiner la ligne d'échelle
    ctx.strokeStyle = "#374151"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(scaleX, scaleY - 15)
    ctx.lineTo(scaleX + actualPixelLength, scaleY - 15)
    ctx.stroke()
    
    // Marques aux extrémités
    ctx.beginPath()
    ctx.moveTo(scaleX, scaleY - 20)
    ctx.lineTo(scaleX, scaleY - 10)
    ctx.moveTo(scaleX + actualPixelLength, scaleY - 20)
    ctx.lineTo(scaleX + actualPixelLength, scaleY - 10)
    ctx.stroke()
    
    // Texte de l'échelle
    ctx.font = `${isMobile ? 10 : 12}px system-ui, -apple-system, sans-serif`
    ctx.fillStyle = "#374151"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    
    const scaleText = roundedMeters < 1 ? `${roundedMeters.toFixed(1)}m` : `${roundedMeters}m`
    ctx.fillText(scaleText, scaleX + actualPixelLength / 2, scaleY - 8)
  }, [state.zoom])

  // === FONCTIONS DE RENDU 2D UNIFIÉES ===
  
  const drawRoomBackground = useCallback(
    (ctx: CanvasRenderingContext2D, room: Room, isSelected: boolean, isHovered: boolean) => {
      if (room.polygon.length < 3) return

      ctx.beginPath()
      const firstPoint = worldToScreen(room.polygon[0].x * GRID_SIZE, room.polygon[0].y * GRID_SIZE)
      ctx.moveTo(firstPoint.x, firstPoint.y)

      for (let i = 1; i < room.polygon.length; i++) {
        const point = worldToScreen(room.polygon[i].x * GRID_SIZE, room.polygon[i].y * GRID_SIZE)
        ctx.lineTo(point.x, point.y)
      }
      ctx.closePath()

      const isDraggingThis = draggedRoom?.roomId === room.id || (draggedVertex && draggedVertex.roomId === room.id)
      const fillColor =
        isDraggingThis && !isValidPlacement
          ? "rgba(239, 68, 68, 0.08)"
          : isSelected
            ? "rgba(59, 130, 246, 0.08)"
            : isHovered
              ? "rgba(59, 130, 246, 0.05)"
              : "rgba(248, 250, 252, 0.7)" // Fond très subtil

      ctx.fillStyle = fillColor
      ctx.fill()
    },
    [draggedRoom, draggedVertex, isValidPlacement, state.zoom, worldToScreen]
  )

  const drawRoomOutline = useCallback(
    (ctx: CanvasRenderingContext2D, room: Room, isSelected: boolean, isHovered: boolean) => {
      if (room.polygon.length < 3) return

      ctx.beginPath()
      const firstPoint = worldToScreen(room.polygon[0].x * GRID_SIZE, room.polygon[0].y * GRID_SIZE)
      ctx.moveTo(firstPoint.x, firstPoint.y)

      for (let i = 1; i < room.polygon.length; i++) {
        const point = worldToScreen(room.polygon[i].x * GRID_SIZE, room.polygon[i].y * GRID_SIZE)
        ctx.lineTo(point.x, point.y)
      }
      ctx.closePath()

      const isDraggingThis = draggedRoom?.roomId === room.id || (draggedVertex && draggedVertex.roomId === room.id)
      const strokeColor =
        isDraggingThis && !isValidPlacement
          ? "rgb(239, 68, 68)"
          : isSelected
            ? "rgb(59, 130, 246)"
            : isHovered
              ? "rgb(96, 165, 250)"
              : "rgb(148, 163, 184)" // Couleur uniforme pour toutes les outlines

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 1 // Épaisseurs unifiées
      ctx.stroke()

      // Points de contrôle uniquement en mode sélection
      if (state.selectedTool === "select" || isSelected) {
        room.polygon.forEach((point, index) => {
          const screenPoint = worldToScreen(point.x * GRID_SIZE, point.y * GRID_SIZE)
          const isVertexHovered =
            hoveredElement?.type === "vertex" && hoveredElement.id === room.id && hoveredElement.vertexIndex === index

          const vertexRadius = (isVertexHovered ? 6 : isSelected ? 4 : 3) * state.zoom

          ctx.beginPath()
          ctx.arc(screenPoint.x, screenPoint.y, vertexRadius, 0, Math.PI * 2)

          ctx.fillStyle = isVertexHovered ? "rgb(34, 197, 94)" : isSelected ? "rgb(59, 130, 246)" : "rgb(115, 115, 115)"
          ctx.fill()

          ctx.strokeStyle = "white"
          ctx.lineWidth = 1
          ctx.stroke()
        })
      }
    },
    [draggedRoom, draggedVertex, isValidPlacement, state.zoom, state.selectedTool, worldToScreen, hoveredElement]
  )

  // Maintenir la fonction drawRoom pour compatibilité
  const drawRoom = useCallback(
    (ctx: CanvasRenderingContext2D, room: Room, isSelected: boolean, isHovered: boolean) => {
      drawRoomBackground(ctx, room, isSelected, isHovered)
      drawRoomOutline(ctx, room, isSelected, isHovered)
    },
    [drawRoomBackground, drawRoomOutline]
  )

  const drawArtwork = useCallback(
    (ctx: CanvasRenderingContext2D, artwork: Artwork, isSelected: boolean, isHovered: boolean) => {
      const size = artwork.size || [1, 1]
      const topLeft = worldToScreen(artwork.xy[0] * GRID_SIZE, artwork.xy[1] * GRID_SIZE)
      const width = size[0] * GRID_SIZE * state.zoom
      const height = size[1] * GRID_SIZE * state.zoom

      const isDraggingThis = draggedArtwork?.artworkId === artwork.id || resizingArtwork?.artworkId === artwork.id
      
      // Vérifier si l'œuvre est complète (a un titre et un PDF ou PDF temporaire)
      const hasPdf = (artwork.pdfLink && artwork.pdfLink.trim() !== '') || (artwork.tempPdfBase64 && artwork.tempPdfBase64.trim() !== '')
      const isComplete = artwork.name && artwork.name.trim() !== '' && hasPdf
      
      // Couleurs de base selon l'état de complétude
      const baseStrokeColor = isComplete ? "rgb(59, 130, 246)" : "rgb(239, 68, 68)" // bleu si complète, rouge sinon
      const baseFillColor = isComplete ? "rgba(219, 234, 254, 0.8)" : "rgba(254, 226, 226, 0.8)" // bleu clair si complète, rouge clair sinon

      ctx.fillStyle =
        isDraggingThis && !isValidPlacement
          ? "rgba(239, 68, 68, 0.3)"
          : isSelected
            ? (isComplete ? "rgba(59, 130, 246, 0.3)" : "rgba(239, 68, 68, 0.3)")
            : isHovered
              ? (isComplete ? "rgba(59, 130, 246, 0.2)" : "rgba(239, 68, 68, 0.2)")
              : baseFillColor
      ctx.fillRect(topLeft.x, topLeft.y, width, height)

      ctx.strokeStyle =
        isDraggingThis && !isValidPlacement
          ? "rgb(239, 68, 68)"
          : isSelected
            ? baseStrokeColor
            : isHovered
              ? (isComplete ? "rgb(96, 165, 250)" : "rgb(248, 113, 113)")
              : baseStrokeColor
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1
      ctx.strokeRect(topLeft.x, topLeft.y, width, height)

      if ((isSelected || isHovered) && state.selectedTool === "select") {
        const handleSize = 8 * state.zoom
        const handles = [
          { x: topLeft.x, y: topLeft.y }, // nw
          { x: topLeft.x + width, y: topLeft.y }, // ne
          { x: topLeft.x, y: topLeft.y + height }, // sw
          { x: topLeft.x + width, y: topLeft.y + height }, // se
          { x: topLeft.x + width / 2, y: topLeft.y }, // n
          { x: topLeft.x + width / 2, y: topLeft.y + height }, // s
          { x: topLeft.x, y: topLeft.y + height / 2 }, // w
          { x: topLeft.x + width, y: topLeft.y + height / 2 }, // e
        ]

        handles.forEach((handle) => {
          ctx.beginPath()
          ctx.arc(handle.x, handle.y, handleSize, 0, Math.PI * 2)
          ctx.fillStyle = "white"
          ctx.fill()
          ctx.strokeStyle = baseStrokeColor
          ctx.lineWidth = 2
          ctx.stroke()
        })
      }

      ctx.fillStyle = baseStrokeColor
      ctx.font = `${14 * state.zoom}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("🖼", topLeft.x + width / 2, topLeft.y + height / 2)
    },
    [worldToScreen, state.zoom, state.selectedTool, draggedArtwork, resizingArtwork, isValidPlacement],
  )

  const drawDoor = useCallback(
    (ctx: CanvasRenderingContext2D, door: Door, isSelected: boolean, isHovered: boolean) => {
      const start = worldToScreen(door.segment[0].x * GRID_SIZE, door.segment[0].y * GRID_SIZE)
      const end = worldToScreen(door.segment[1].x * GRID_SIZE, door.segment[1].y * GRID_SIZE)

      const isDraggingThis = draggedElement?.type === "door" && draggedElement.id === door.id
      const strokeColor =
        isDraggingThis && !isValidPlacement
          ? COLORS.doorInvalid
          : isSelected
            ? COLORS.doorSelected
            : isHovered
              ? COLORS.doorHovered
              : COLORS.doorDefault

      // Ligne de base plus fine et élégante
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = (isSelected ? 8 : isHovered ? 6 : 4) * state.zoom
      ctx.lineCap = "round"
      ctx.stroke()

      // Ligne décorative plus subtile
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = "white"
      ctx.lineWidth = (isSelected ? 4 : isHovered ? 3 : 2) * state.zoom
      ctx.lineCap = "round"
      ctx.stroke()

      const isStartHovered =
        hoveredElement?.type === "doorEndpoint" && hoveredElement.id === door.id && hoveredElement.endpoint === "start"
      const isEndHovered =
        hoveredElement?.type === "doorEndpoint" && hoveredElement.id === door.id && hoveredElement.endpoint === "end"

      if (
        state.selectedTool === "select" ||
        isSelected ||
        isHovered ||
        isDraggingThis ||
        isStartHovered ||
        isEndHovered
      ) {
        const endpointRadius = 10 * state.zoom

        // Points de contrôle avec meilleur contraste
        ctx.beginPath()
        ctx.arc(start.x, start.y, isStartHovered ? endpointRadius * 1.3 : endpointRadius, 0, Math.PI * 2)
        if (isStartHovered) {
          ctx.shadowColor = strokeColor
          ctx.shadowBlur = 20
        }
        ctx.fillStyle = strokeColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.stroke()

        if (isStartHovered) {
          ctx.beginPath()
          ctx.arc(start.x, start.y, endpointRadius * 1.6, 0, Math.PI * 2)
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = 2
          ctx.stroke()
        }

        ctx.beginPath()
        ctx.arc(end.x, end.y, isEndHovered ? endpointRadius * 1.3 : endpointRadius, 0, Math.PI * 2)
        if (isEndHovered) {
          ctx.shadowColor = strokeColor
          ctx.shadowBlur = 20
        }
        ctx.fillStyle = strokeColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.stroke()

        if (isEndHovered) {
          ctx.beginPath()
          ctx.arc(end.x, end.y, endpointRadius * 1.6, 0, Math.PI * 2)
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Icône et texte plus discrets
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      
      // Fond plus discret
      const fontSize = Math.max(8, 10 * state.zoom)
      ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      
      const text = "P"
      const textWidth = ctx.measureText(text).width
      const padding = 4 * state.zoom
      
      // Rectangle de fond minimaliste
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
      ctx.beginPath()
      ctx.roundRect(midX - textWidth/2 - padding, midY - fontSize/2 - padding/2, textWidth + padding*2, fontSize + padding, 2 * state.zoom)
      ctx.fill()
      
      // Contour discret
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 1
      ctx.stroke()
      
      // Texte simple
      ctx.fillStyle = strokeColor
      ctx.fillText(text, midX, midY)
    },
    [worldToScreen, state.zoom, state.selectedTool, draggedElement, hoveredElement, isValidPlacement],
  )

  const drawVerticalLink = useCallback(
    (ctx: CanvasRenderingContext2D, link: VerticalLink, isSelected: boolean, isHovered: boolean) => {
      const start = worldToScreen(link.segment[0].x * GRID_SIZE, link.segment[0].y * GRID_SIZE)
      const end = worldToScreen(link.segment[1].x * GRID_SIZE, link.segment[1].y * GRID_SIZE)

      const isDraggingThis = draggedElement?.type === "verticalLink" && draggedElement.id === link.id
      
      const isStairs = link.type === "stairs"
      
      const strokeColor =
        isDraggingThis && !isValidPlacement
          ? (isStairs ? COLORS.stairsInvalid : COLORS.elevatorInvalid)
          : isSelected
            ? (isStairs ? COLORS.stairsSelected : COLORS.elevatorSelected)
            : isHovered
              ? (isStairs ? COLORS.stairsHovered : COLORS.elevatorHovered)
              : (isStairs ? COLORS.stairsDefault : COLORS.elevatorDefault)

      // Ligne principale plus fine
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = (isSelected ? 8 : isHovered ? 6 : 4) * state.zoom
      ctx.lineCap = "round"
      ctx.stroke()

      // Ligne décorative interne plus discrète
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = "white"
      ctx.lineWidth = (isSelected ? 4 : isHovered ? 3 : 2) * state.zoom
      ctx.lineCap = "round"
      ctx.stroke()

      // Pattern simplifié pour différencier escaliers et ascenseurs
      if (isStairs) {
        // Motif en escalier plus discret
        const segmentLength = Math.hypot(end.x - start.x, end.y - start.y)
        const steps = Math.max(2, Math.floor(segmentLength / (30 * state.zoom)))
        
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = 1 * state.zoom
        
        for (let i = 1; i < steps; i++) {
          const t = i / steps
          const x = start.x + (end.x - start.x) * t
          const y = start.y + (end.y - start.y) * t
          
          // Ligne perpendiculaire plus petite
          const angle = Math.atan2(end.y - start.y, end.x - start.x) + Math.PI / 2
          const stepSize = 3 * state.zoom
          
          ctx.beginPath()
          ctx.moveTo(x - Math.cos(angle) * stepSize, y - Math.sin(angle) * stepSize)
          ctx.lineTo(x + Math.cos(angle) * stepSize, y + Math.sin(angle) * stepSize)
          ctx.stroke()
        }
      }

      const isStartHovered =
        hoveredElement?.type === "linkEndpoint" && hoveredElement.id === link.id && hoveredElement.endpoint === "start"
      const isEndHovered =
        hoveredElement?.type === "linkEndpoint" && hoveredElement.id === link.id && hoveredElement.endpoint === "end"

      if (
        state.selectedTool === "select" ||
        isSelected ||
        isHovered ||
        isDraggingThis ||
        isStartHovered ||
        isEndHovered
      ) {
        const endpointRadius = 12 * state.zoom

        // Points de contrôle améliorés
        ctx.beginPath()
        ctx.arc(start.x, start.y, isStartHovered ? endpointRadius * 1.3 : endpointRadius, 0, Math.PI * 2)
        if (isStartHovered) {
          ctx.shadowColor = strokeColor
          ctx.shadowBlur = 20
        }
        ctx.fillStyle = strokeColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.stroke()

        if (isStartHovered) {
          ctx.beginPath()
          ctx.arc(start.x, start.y, endpointRadius * 1.6, 0, Math.PI * 2)
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = 2
          ctx.stroke()
        }

        ctx.beginPath()
        ctx.arc(end.x, end.y, isEndHovered ? endpointRadius * 1.3 : endpointRadius, 0, Math.PI * 2)
        if (isEndHovered) {
          ctx.shadowColor = strokeColor
          ctx.shadowBlur = 20
        }
        ctx.fillStyle = strokeColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.stroke()

        if (isEndHovered) {
          ctx.beginPath()
          ctx.arc(end.x, end.y, endpointRadius * 1.6, 0, Math.PI * 2)
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Icône et texte plus discrets
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2

      const direction = link.direction || "both"
      let icon = ""
      let text = ""
      
      if (isStairs) {
        text = "E"
        if (direction === "up") icon = "↑"
        else if (direction === "down") icon = "↓"
        else icon = "↕"
      } else {
        text = "A"
        if (direction === "up") icon = "↑"
        else if (direction === "down") icon = "↓"
        else icon = "↕"
      }

      // Fond minimaliste
      const fontSize = Math.max(8, 10 * state.zoom)
      ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      
      const textWidth = ctx.measureText(text).width
      const padding = 4 * state.zoom
      
      // Rectangle de fond discret
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
      ctx.beginPath()
      ctx.roundRect(midX - textWidth/2 - padding, midY - fontSize/2 - padding/2, textWidth + padding*2, fontSize + padding, 2 * state.zoom)
      ctx.fill()
      
      // Contour thématique discret
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 1
      ctx.stroke()
      
      // Texte principal simple
      ctx.fillStyle = strokeColor
      ctx.fillText(text, midX, midY)
      
      // Petit indicateur de direction
      if (icon) {
        const iconSize = Math.max(6, 8 * state.zoom)
        ctx.font = `${iconSize}px system-ui, -apple-system, sans-serif`
        ctx.fillStyle = strokeColor
        ctx.fillText(icon, midX + 8 * state.zoom, midY - 2 * state.zoom)
      }
    },
    [worldToScreen, state.zoom, state.selectedTool, draggedElement, hoveredElement, isValidPlacement],
  )

  const drawWall = useCallback(
    (ctx: CanvasRenderingContext2D, wall: Wall, isSelected: boolean, isHovered: boolean) => {
      const start = worldToScreen(wall.segment[0].x * GRID_SIZE, wall.segment[0].y * GRID_SIZE)
      const end = worldToScreen(wall.segment[1].x * GRID_SIZE, wall.segment[1].y * GRID_SIZE)

      const isDraggingThis = draggedElement?.type === "wall" && draggedElement.id === wall.id
      
      const strokeColor =
        isDraggingThis && !isValidPlacement
          ? COLORS.wallInvalid || "rgb(239, 68, 68)"
          : isSelected
            ? COLORS.wallSelected || "rgb(139, 69, 19)"
            : isHovered
              ? COLORS.wallHovered || "rgb(160, 82, 45)"
              : COLORS.wallDefault || "rgb(101, 67, 33)"

      // Calcul de l'épaisseur du mur en pixels
      const thicknessPixels = (wall.thickness || WALL_THICKNESS.INTERIOR) * GRID_SIZE * state.zoom

      // Vecteur perpendiculaire pour l'épaisseur
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.hypot(dx, dy)
      
      if (length === 0) return

      const perpX = (-dy / length) * (thicknessPixels / 2)
      const perpY = (dx / length) * (thicknessPixels / 2)

      // Dessiner le mur comme un rectangle épais
      ctx.beginPath()
      ctx.moveTo(start.x + perpX, start.y + perpY)
      ctx.lineTo(end.x + perpX, end.y + perpY)
      ctx.lineTo(end.x - perpX, end.y - perpY)
      ctx.lineTo(start.x - perpX, start.y - perpY)
      ctx.closePath()

      // Remplissage du mur
      ctx.fillStyle = strokeColor.replace('rgb', 'rgba').replace(')', ', 0.7)')
      ctx.fill()

      // Contour du mur
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 1
      ctx.stroke()

      // Points de contrôle aux extrémités si sélectionné ou survolé
      const isStartHovered =
        hoveredElement?.type === "wallEndpoint" && hoveredElement.id === wall.id && hoveredElement.endpoint === "start"
      const isEndHovered =
        hoveredElement?.type === "wallEndpoint" && hoveredElement.id === wall.id && hoveredElement.endpoint === "end"

      if (
        state.selectedTool === "select" ||
        isSelected ||
        isHovered ||
        isDraggingThis ||
        isStartHovered ||
        isEndHovered
      ) {
        const endpointRadius = 8 * state.zoom

        // Point de début
        ctx.beginPath()
        ctx.arc(start.x, start.y, isStartHovered ? endpointRadius * 1.3 : endpointRadius, 0, Math.PI * 2)
        if (isStartHovered) {
          ctx.shadowColor = strokeColor
          ctx.shadowBlur = 15
        }
        ctx.fillStyle = strokeColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "white"
        ctx.lineWidth = 2
        ctx.stroke()

        // Point de fin
        ctx.beginPath()
        ctx.arc(end.x, end.y, isEndHovered ? endpointRadius * 1.3 : endpointRadius, 0, Math.PI * 2)
        if (isEndHovered) {
          ctx.shadowColor = strokeColor
          ctx.shadowBlur = 15
        }
        ctx.fillStyle = strokeColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "white"
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Affichage de l'épaisseur si sélectionné
      if (isSelected) {
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2
        
        const fontSize = Math.max(8, 8 * state.zoom)
        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        
        const thicknessText = `${Math.round((wall.thickness || WALL_THICKNESS.INTERIOR) * 100)}cm`
        const textWidth = ctx.measureText(thicknessText).width
        const padding = 3 * state.zoom
        
        // Fond pour le texte
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
        ctx.beginPath()
        ctx.roundRect(midX - textWidth/2 - padding, midY - fontSize/2 - padding/2, textWidth + padding*2, fontSize + padding, 2 * state.zoom)
        ctx.fill()
        
        // Contour
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = 1
        ctx.stroke()
        
        // Texte
        ctx.fillStyle = strokeColor
        ctx.fillText(thicknessText, midX, midY)
      }
    },
    [worldToScreen, state.zoom, state.selectedTool, draggedElement, hoveredElement, isValidPlacement],
  )

  // === SYSTÈME DE VALIDATION ULTRA-STRICT TEMPS RÉEL ===
  const validatePlacement = useCallback(
    (tool: string, point: Point, startPoint?: Point) => {
      // RÈGLE 1: Aucune superposition de surface possible
      // RÈGLE 2: Snap intelligent pour collage parfait sans chevauchement
      // RÈGLE 3: Retour automatique si action impossible
      
      if (tool === "room" && state.currentPolygon.length > 0) {
        const firstPoint = state.currentPolygon[0]
        const distance = Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y)
        
        if (distance < 0.3 && state.currentPolygon.length >= 3) {
          // Validation stricte du polygone fermé
          const tempRoom = {
            id: 'temp-room',
            name: 'Temporary Room',
            polygon: [...state.currentPolygon]
          }
          
          const validationResult = validateRoomGeometry(tempRoom, {
            floor: currentFloor,
            strictMode: true,
            allowWarnings: false
          })
          
          setIsValidPlacement(validationResult.valid && validationResult.severity !== 'error')
          return
        }
        
        // Validation de chaque nouveau point du polygone
        if (state.currentPolygon.length >= 2) {
          const testPolygon = [...state.currentPolygon, point]
          const tempRoom = {
            id: 'temp-room',
            name: 'Temporary Room',
            polygon: testPolygon
          }
          
          const validationResult = validateRoomGeometry(tempRoom, {
            floor: currentFloor,
            strictMode: true,
            allowWarnings: false
          })
          
          setIsValidPlacement(validationResult.valid && validationResult.severity !== 'error')
        } else {
          setIsValidPlacement(true)
        }
        
      } else if (tool === "rectangle" || tool === "circle" || tool === "triangle" || tool === "arc") {
        if (startPoint && point) {
          let testPolygon: Point[] = []

          if (tool === "rectangle") {
            testPolygon = [startPoint, { x: point.x, y: startPoint.y }, point, { x: startPoint.x, y: point.y }]
          } else if (tool === "circle") {
            const radius = Math.max(Math.abs(point.x - startPoint.x), Math.abs(point.y - startPoint.y))
            testPolygon = createCirclePolygon(startPoint, radius)
          } else if (tool === "triangle") {
            testPolygon = createTrianglePolygon(startPoint, point)
          } else if (tool === "arc") {
            testPolygon = createArcPolygon(startPoint, point)
          }

          // VALIDATION ULTRA-STRICTE ANTI-SUPERPOSITION
          const tempRoom = {
            id: 'temp-room',
            name: 'Temporary Room',
            polygon: testPolygon
          }
          
          const validationResult = validateRoomGeometry(tempRoom, {
            floor: currentFloor,
            strictMode: true,
            allowWarnings: false
          })
          
          // Validation supplémentaire: aucune surface ne peut se chevaucher
          const hasOverlap = currentFloor.rooms.some(room => 
            polygonsIntersect(testPolygon, room.polygon)
          )
          
          const isValid = validationResult.valid && 
                         validationResult.severity !== 'error' && 
                         !hasOverlap
          
          setIsValidPlacement(isValid)
        }
        
      } else if (tool === "artwork") {
        if (startPoint && point) {
          const minX = Math.min(startPoint.x, point.x)
          const minY = Math.min(startPoint.y, point.y)
          const maxX = Math.max(startPoint.x, point.x)
          const maxY = Math.max(startPoint.y, point.y)

          const tempArtwork = {
            id: 'temp-artwork',
            name: 'Temporary Artwork',
            xy: [minX, minY] as readonly [number, number],
            size: [maxX - minX, maxY - minY] as readonly [number, number],
            pdf_id: ''
          }
          
          // Validation stricte des artworks
          const validationResult = validateArtworkPlacement(tempArtwork, {
            floor: currentFloor,
            strictMode: true,
            allowWarnings: false
          })
          
          // Vérification supplémentaire: pas de chevauchement avec autres artworks
          const hasOverlapWithArtworks = currentFloor.artworks.some(artwork => {
            const [ax, ay] = artwork.xy
            const [aWidth, aHeight] = artwork.size || [1, 1]
            const [tempWidth, tempHeight] = tempArtwork.size
            
            return !(minX >= ax + aWidth || 
                    maxX <= ax || 
                    minY >= ay + aHeight || 
                    maxY <= ay)
          })
          
          const isValid = validationResult.valid && 
                         validationResult.severity !== 'error' && 
                         !hasOverlapWithArtworks
          
          setIsValidPlacement(isValid)
        }
        
      } else if (tool === "door" || tool === "stairs" || tool === "elevator") {
        if (startPoint && point && wallSegmentSnap) {
          const segment = calculateWallSegment(
            startPoint,
            point,
            wallSegmentSnap.segmentStart,
            wallSegmentSnap.segmentEnd,
          )
          
          // Validation stricte des éléments sur mur
          let tempElement, validationResult
          
          if (tool === "door") {
            tempElement = {
              id: 'temp-door',
              segment: [segment.start, segment.end] as readonly [Point, Point],
              room_a: '',
              room_b: '',
              width: Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
            }
            
            validationResult = validateDoor(tempElement, {
              floor: currentFloor,
              strictMode: true,
              allowWarnings: false
            })
          } else {
            tempElement = {
              id: 'temp-link',
              type: tool as 'stairs' | 'elevator',
              segment: [segment.start, segment.end] as readonly [Point, Point],
              to_floor: '',
              width: Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
            }
            
            validationResult = validateVerticalLink(tempElement, {
              floor: currentFloor,
              strictMode: true,
              allowWarnings: false
            })
          }
          
          const isValid = validationResult.valid && validationResult.severity !== 'error'
          setIsValidPlacement(isValid)
          setCreationPreview({ start: segment.start, end: segment.end, valid: isValid })
        } else {
          setIsValidPlacement(false)
          setCreationPreview(null)
        }
        
      } else if (tool === "wall") {
        if (startPoint && point) {
          // Validation simplifiée mais stricte pour les murs
          const tempWall = createWall(startPoint, point, WALL_THICKNESS.INTERIOR, '')
          const validation = validateWallPlacement(tempWall, currentFloor)
          
          // Vérifier qu'aucune superposition n'existe
          const noOverlap = !currentFloor.walls.some(wall => {
            return segmentsIntersect(startPoint, point, wall.segment[0], wall.segment[1])
          })
          
          const isValid = validation.valid && noOverlap
          setIsValidPlacement(isValid)
          setCreationPreview({ start: startPoint, end: point, valid: isValid })
        } else {
          setIsValidPlacement(true)
          setCreationPreview(null)
        }
      } else {
        // Outil non reconnu - validation par défaut
        setIsValidPlacement(true)
      }
    },
    [state.currentPolygon, currentFloor, wallSegmentSnap, state.zoom],
  )

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { width, height } = canvas

    ctx.clearRect(0, 0, width, height)

    drawGrid(ctx, width, height)

    // === RENDU UNIFIÉ 2D STRICT ===
    // Tous les éléments au même niveau pour éviter les superpositions visuelles
    // Ordre: Room backgrounds → Walls → Elements (tous au même z-index)
    
    // 1. Fond des pièces (arrière-plan uniquement)
    currentFloor.rooms.forEach((room) => {
      const isSelected = (state.selectedElementId === room.id && state.selectedElementType === "room") ||
                        isElementSelected(room.id, "room", state.selectedElements)
      const isHovered = hoveredElement?.type === "room" && hoveredElement.id === room.id
      drawRoomBackground(ctx, room, isSelected, isHovered)
    })

    // 2. Murs (infrastructure de base)
    currentFloor.walls.forEach((wall) => {
      const isSelected = (state.selectedElementId === wall.id && state.selectedElementType === "wall") ||
                        isElementSelected(wall.id, "wall", state.selectedElements)
      const isHovered = hoveredElement?.type === "wall" && hoveredElement.id === wall.id
      drawWall(ctx, wall, isSelected, isHovered)
    })

    // 3. Tous les éléments au même niveau (aucune superposition)
    const allElements = [
      ...currentFloor.rooms.map(room => ({ ...room, elementType: 'room' as const })),
      ...currentFloor.artworks.map(artwork => ({ ...artwork, elementType: 'artwork' as const })),
      ...currentFloor.doors.map(door => ({ ...door, elementType: 'door' as const })),
      ...currentFloor.verticalLinks.map(link => ({ ...link, elementType: 'verticalLink' as const }))
    ]

    // Rendu unifié de tous les éléments
    allElements.forEach((element) => {
      const isSelected = (state.selectedElementId === element.id && state.selectedElementType === element.elementType) ||
                        isElementSelected(element.id, element.elementType, state.selectedElements)
      const isHovered = hoveredElement?.type === element.elementType && hoveredElement.id === element.id
      
      switch (element.elementType) {
        case 'room':
          drawRoomOutline(ctx, element, isSelected, isHovered)
          break
        case 'artwork':
          drawArtwork(ctx, element, isSelected, isHovered)
          break
        case 'door':
          drawDoor(ctx, element, isSelected, isHovered)
          break
        case 'verticalLink':
          drawVerticalLink(ctx, element, isSelected, isHovered)
          break
      }
    })

    if (isDragging && drawStartPoint && hoveredPoint) {
      ctx.beginPath()

      if (state.selectedTool === "rectangle") {
        // Calculer les coordonnées correctement pour éviter les déformations
        const minX = Math.min(drawStartPoint.x, hoveredPoint.x)
        const maxX = Math.max(drawStartPoint.x, hoveredPoint.x)
        const minY = Math.min(drawStartPoint.y, hoveredPoint.y)
        const maxY = Math.max(drawStartPoint.y, hoveredPoint.y)
        
        const topLeft = worldToScreen(minX * GRID_SIZE, minY * GRID_SIZE)
        const bottomRight = worldToScreen(maxX * GRID_SIZE, maxY * GRID_SIZE)
        const width = bottomRight.x - topLeft.x
        const height = bottomRight.y - topLeft.y
        ctx.rect(topLeft.x, topLeft.y, width, height)
      } else if (state.selectedTool === "circle") {
        const center = worldToScreen(drawStartPoint.x * GRID_SIZE, drawStartPoint.y * GRID_SIZE)
        // Utiliser la distance euclidienne pour un cercle plus naturel
        const radiusInGrid = Math.hypot(hoveredPoint.x - drawStartPoint.x, hoveredPoint.y - drawStartPoint.y)
        const radius = radiusInGrid * GRID_SIZE * state.zoom
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
      } else if (state.selectedTool === "arc") {
        const polygon = createArcPolygon(drawStartPoint, hoveredPoint)
        const firstPoint = worldToScreen(polygon[0].x * GRID_SIZE, polygon[0].y * GRID_SIZE)
        ctx.moveTo(firstPoint.x, firstPoint.y)
        for (let i = 1; i < polygon.length; i++) {
          const point = worldToScreen(polygon[i].x * GRID_SIZE, polygon[i].y * GRID_SIZE)
          ctx.lineTo(point.x, point.y)
        }
        ctx.closePath()
      } else if (state.selectedTool === "triangle") {
        const polygon = createTrianglePolygon(drawStartPoint, hoveredPoint)
        const firstPoint = worldToScreen(polygon[0].x * GRID_SIZE, polygon[0].y * GRID_SIZE)
        ctx.moveTo(firstPoint.x, firstPoint.y)
        for (let i = 1; i < polygon.length; i++) {
          const point = worldToScreen(polygon[i].x * GRID_SIZE, polygon[i].y * GRID_SIZE)
          ctx.lineTo(point.x, point.y)
        }
        ctx.closePath()
      } else if (state.selectedTool === "artwork") {
        const topLeft = worldToScreen(
          Math.min(drawStartPoint.x, hoveredPoint.x) * GRID_SIZE,
          Math.min(drawStartPoint.y, hoveredPoint.y) * GRID_SIZE,
        )
        const bottomRight = worldToScreen(
          Math.max(drawStartPoint.x, hoveredPoint.x) * GRID_SIZE,
          Math.max(drawStartPoint.y, hoveredPoint.y) * GRID_SIZE,
        )
        const width = bottomRight.x - topLeft.x
        const height = bottomRight.y - topLeft.y
        ctx.rect(topLeft.x, topLeft.y, width, height)
      }

      ctx.fillStyle = getCreationPreviewColor(isValidPlacement, 0.2)
      ctx.fill()
      ctx.strokeStyle = getValidationColor(isValidPlacement)
      ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
      ctx.stroke()
    }

    if (state.currentPolygon.length > 0) {
      ctx.beginPath()
      const firstPoint = worldToScreen(state.currentPolygon[0].x * GRID_SIZE, state.currentPolygon[0].y * GRID_SIZE)
      ctx.moveTo(firstPoint.x, firstPoint.y)

      for (let i = 1; i < state.currentPolygon.length; i++) {
        const point = worldToScreen(state.currentPolygon[i].x * GRID_SIZE, state.currentPolygon[i].y * GRID_SIZE)
        ctx.lineTo(point.x, point.y)
      }

      let isClosing = false
      if (hoveredPoint) {
        const hoverScreen = worldToScreen(hoveredPoint.x * GRID_SIZE, hoveredPoint.y * GRID_SIZE)
        const distanceToFirst = Math.hypot(
          hoveredPoint.x - state.currentPolygon[0].x,
          hoveredPoint.y - state.currentPolygon[0].y,
        )

        // Zone de fermeture plus tolérante et visuel amélioré
        const closeThreshold = 0.5
        if (distanceToFirst < closeThreshold && state.currentPolygon.length >= 3) {
          ctx.lineTo(firstPoint.x, firstPoint.y)
          ctx.closePath()
          isClosing = true

          // Remplissage avec dégradé subtil pour le polygone en cours de finalisation
          ctx.fillStyle = isValidPlacement ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)"
          ctx.fill()

          // Indicateur de fermeture avec pulsation visuelle
          const pulseRadius = 6 + Math.sin(Date.now() / 200) * 2
          ctx.beginPath()
          ctx.arc(firstPoint.x, firstPoint.y, pulseRadius * state.zoom, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(34, 197, 94, 0.6)"
          ctx.fill()
          ctx.strokeStyle = "rgb(255, 255, 255)"
          ctx.lineWidth = 2 * state.zoom
          ctx.stroke()
          
          // Cercle extérieur pour indiquer la zone de fermeture
          ctx.beginPath()
          ctx.arc(firstPoint.x, firstPoint.y, closeThreshold * GRID_SIZE * state.zoom, 0, Math.PI * 2)
          ctx.strokeStyle = "rgba(34, 197, 94, 0.3)"
          ctx.lineWidth = 1 * state.zoom
          ctx.setLineDash([5 * state.zoom, 5 * state.zoom])
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          // Ligne de prévisualisation plus fluide avec courbe lisse
          const lastPoint = state.currentPolygon[state.currentPolygon.length - 1]
          const lastScreen = worldToScreen(lastPoint.x * GRID_SIZE, lastPoint.y * GRID_SIZE)
          
          // Utiliser une courbe de Bézier pour une ligne plus douce
          const midX = (lastScreen.x + hoverScreen.x) / 2
          const midY = (lastScreen.y + hoverScreen.y) / 2
          
          ctx.strokeStyle = "rgba(100, 116, 139, 0.6)"
          ctx.lineWidth = 2 * state.zoom
          ctx.setLineDash([10 * state.zoom, 5 * state.zoom])
          ctx.lineTo(hoverScreen.x, hoverScreen.y)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // Contour du polygone
      ctx.strokeStyle = getValidationColor(isValidPlacement)
      ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
      ctx.stroke()

      // Si le polygone est fermé, ajouter un remplissage léger
      if (isClosing) {
        ctx.fillStyle = getCreationPreviewColor(isValidPlacement, 0.15)
        ctx.fill()
      }

      // Points du polygone avec design amélioré
      state.currentPolygon.forEach((point, index) => {
        const screenPoint = worldToScreen(point.x * GRID_SIZE, point.y * GRID_SIZE)
        
        // Point principal
        ctx.beginPath()
        const radius = index === 0 ? 5 * state.zoom : 4 * state.zoom // Premier point plus grand
        ctx.arc(screenPoint.x, screenPoint.y, radius, 0, Math.PI * 2)
        
        if (index === 0) {
          // Premier point avec style distinctif
          ctx.fillStyle = "rgba(34, 197, 94, 0.8)"
          ctx.fill()
          ctx.strokeStyle = "white"
          ctx.lineWidth = 2 * state.zoom
          ctx.stroke()
          
          // Numéro sur le premier point
          ctx.fillStyle = "white"
          ctx.font = `${10 * state.zoom}px system-ui`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText("1", screenPoint.x, screenPoint.y)
        } else {
          // Autres points avec gradient subtil
          ctx.fillStyle = "rgba(59, 130, 246, 0.8)"
          ctx.fill()
          ctx.strokeStyle = "white"
          ctx.lineWidth = 1.5 * state.zoom
          ctx.stroke()
        }
        
        // Halo de sélection pour une meilleure visibilité
        ctx.beginPath()
        ctx.arc(screenPoint.x, screenPoint.y, radius + 2 * state.zoom, 0, Math.PI * 2)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
        ctx.lineWidth = 1 * state.zoom
        ctx.stroke()
      })
    }

    if (
      creationPreview &&
      (state.selectedTool === "door" || state.selectedTool === "stairs" || state.selectedTool === "elevator")
    ) {
      const start = worldToScreen(creationPreview.start.x * GRID_SIZE, creationPreview.start.y * GRID_SIZE)
      const end = worldToScreen(creationPreview.end.x * GRID_SIZE, creationPreview.end.y * GRID_SIZE)

      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = getCreationPreviewColor(creationPreview.valid, 0.6)
      ctx.lineWidth = 8 * state.zoom
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(start.x, start.y, 4 * state.zoom, 0, Math.PI * 2)
      ctx.arc(end.x, end.y, 4 * state.zoom, 0, Math.PI * 2)
      ctx.fillStyle = getValidationColor(creationPreview.valid)
      ctx.fill()
    }

    // Preview pour les murs
    if (creationPreview && state.selectedTool === "wall") {
      const start = worldToScreen(creationPreview.start.x * GRID_SIZE, creationPreview.start.y * GRID_SIZE)
      const end = worldToScreen(creationPreview.end.x * GRID_SIZE, creationPreview.end.y * GRID_SIZE)

      // Dessiner le mur preview avec épaisseur
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.hypot(dx, dy)
      
      if (length > 0) {
        const normalX = -dy / length
        const normalY = dx / length
        const thickness = WALL_THICKNESS.INTERIOR * GRID_SIZE * state.zoom / 2

        const p1 = { x: start.x + normalX * thickness, y: start.y + normalY * thickness }
        const p2 = { x: start.x - normalX * thickness, y: start.y - normalY * thickness }
        const p3 = { x: end.x - normalX * thickness, y: end.y - normalY * thickness }
        const p4 = { x: end.x + normalX * thickness, y: end.y + normalY * thickness }

        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.lineTo(p3.x, p3.y)
        ctx.lineTo(p4.x, p4.y)
        ctx.closePath()
        
        ctx.fillStyle = creationPreview.valid 
          ? getCreationPreviewColor(true, 0.4)
          : getCreationPreviewColor(false, 0.4)
        ctx.fill()
        
        ctx.strokeStyle = creationPreview.valid 
          ? getValidationColor(true, 0.8)
          : getValidationColor(false, 0.8)
        ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
        ctx.stroke()
      }

      // Points de départ et fin
      ctx.beginPath()
      ctx.arc(start.x, start.y, 4 * state.zoom, 0, Math.PI * 2)
      ctx.arc(end.x, end.y, 4 * state.zoom, 0, Math.PI * 2)
      ctx.fillStyle = getValidationColor(creationPreview.valid)
      ctx.fill()
    }



    if (selectionBox) {
      const start = worldToScreen(selectionBox.start.x, selectionBox.start.y)
      const end = worldToScreen(selectionBox.end.x, selectionBox.end.y)

      ctx.fillStyle = "rgba(59, 130, 246, 0.1)"
      ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y)

      ctx.strokeStyle = "rgb(59, 130, 246)"
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y)
      ctx.setLineDash([])
    }

    if (hoveredPoint && state.selectedTool !== "select" && !isDragging && state.currentPolygon.length === 0) {
      const hoverScreen = worldToScreen(hoveredPoint.x * GRID_SIZE, hoveredPoint.y * GRID_SIZE)
      ctx.beginPath()
      ctx.arc(hoverScreen.x, hoverScreen.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = getCreationPreviewColor(isValidPlacement, 0.5)
      ctx.fill()
      ctx.strokeStyle = getValidationColor(isValidPlacement)
      ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
      ctx.stroke()
    }

    // Rendu des mesures dynamiques pendant la création
    if (state.measurements.showDynamicMeasurements) {
      // Mesures pendant le tracé d'un polygone
      if (state.currentPolygon.length > 0) {
        for (let i = 0; i < state.currentPolygon.length; i++) {
          const current = state.currentPolygon[i]
          const next = i === state.currentPolygon.length - 1 && hoveredPoint 
            ? hoveredPoint 
            : state.currentPolygon[(i + 1) % state.currentPolygon.length]
          
          if (next && (i < state.currentPolygon.length - 1 || hoveredPoint)) {
            const distance = calculateDistanceInMeters(current, next)
            drawMeasurement(ctx, current, next, distance, true, false)
          }
        }
      }

      // Mesures pendant la création de rectangles/artwork
      if (isDragging && drawStartPoint && hoveredPoint && 
          (state.selectedTool === "rectangle" || state.selectedTool === "artwork")) {
        const width = Math.abs(hoveredPoint.x - drawStartPoint.x)
        const height = Math.abs(hoveredPoint.y - drawStartPoint.y)
        
        // Mesure largeur
        drawMeasurement(ctx, 
          { x: Math.min(drawStartPoint.x, hoveredPoint.x), y: drawStartPoint.y }, 
          { x: Math.max(drawStartPoint.x, hoveredPoint.x), y: drawStartPoint.y }, 
          calculateDistanceInMeters(
            { x: Math.min(drawStartPoint.x, hoveredPoint.x), y: drawStartPoint.y }, 
            { x: Math.max(drawStartPoint.x, hoveredPoint.x), y: drawStartPoint.y }
          ), 
          true,
          false
        )
        
        // Mesure hauteur
        drawMeasurement(ctx, 
          { x: hoveredPoint.x, y: Math.min(drawStartPoint.y, hoveredPoint.y) }, 
          { x: hoveredPoint.x, y: Math.max(drawStartPoint.y, hoveredPoint.y) }, 
          calculateDistanceInMeters(
            { x: hoveredPoint.x, y: Math.min(drawStartPoint.y, hoveredPoint.y) }, 
            { x: hoveredPoint.x, y: Math.max(drawStartPoint.y, hoveredPoint.y) }
          ), 
          true,
          false
        )
      }
    }

    // Rendu des mesures permanentes
    if (state.measurements.showMeasurements) {
      // Mesures des segments des pièces
      currentFloor.rooms.forEach(room => {
        if (room.polygon.length >= 3) {
          const isRoomSelected = (state.selectedElementId === room.id && state.selectedElementType === "room") ||
                               isElementSelected(room.id, "room", state.selectedElements)
          
          // Mesures des côtés
          for (let i = 0; i < room.polygon.length; i++) {
            const current = room.polygon[i]
            const next = room.polygon[(i + 1) % room.polygon.length]
            const distance = calculateDistanceInMeters(current, next)
            drawMeasurement(ctx, current, next, distance, false, isRoomSelected)
          }
          
          // Surface de la pièce au centre
          const areaFromMeasurements = state.measurements.measurements.find(
            m => m.elementId === room.id && m.type === "area"
          )
          if (areaFromMeasurements) {
            drawAreaMeasurement(ctx, room, areaFromMeasurements.value, isRoomSelected)
          }
        }
      })
    }

    // Dessiner l'échelle dynamique en bas à droite
    drawScale(ctx, width, height)
  }, [
    state,
    currentFloor,
    hoveredPoint,
    isValidPlacement,
    isDragging,
    drawStartPoint,
    hoveredElement,
    creationPreview,
    selectionBox,
    drawGrid,
    drawRoomBackground,
    drawRoomOutline,
    drawWall,
    drawArtwork,
    drawDoor,
    drawVerticalLink,
    worldToScreen,
    draggedRoom,
    draggedWall,
    draggedElement,
    draggedArtwork,
    resizingArtwork,
    drawMeasurement,
    drawAreaMeasurement,
    drawScale,
  ])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (state.isPanning) {
        updateState({
          pan: {
            x: state.pan.x + e.movementX,
            y: state.pan.y + e.movementY,
          },
        })
        return
      }

      const worldPos = screenToWorld(e.clientX, e.clientY)
      let gridPos = snapToGrid(worldPos, GRID_SIZE)
      
      // Snap intelligent selon le contexte - CORRECTION: gridPos est déjà en coordonnées grid
      if (state.selectedTool === "room" || state.selectedTool === "wall") {
        const snapPoints = findSnapPoints(
          gridPos, 
          currentFloor, 
          0.4,
          { 
            elementType: state.selectedTool,
            preferredTypes: ['vertex', 'wall']
          }
        )
        
        if (snapPoints.length > 0) {
          // Le point snappé est déjà en coordonnées grid
          gridPos = snapPoints[0].point
        }
      }

      if (selectionBox && state.selectedTool === "select") {
        setSelectionBox({
          start: selectionBox.start,
          end: worldPos,
        })
        return
      }

      if (draggedRoom) {
        const deltaX = gridPos.x - draggedRoom.startPos.x
        const deltaY = gridPos.y - draggedRoom.startPos.y

        const room = currentFloor.rooms.find((r) => r.id === draggedRoom.roomId)
        if (room) {
          const newPolygon = room.polygon.map((p) => ({
            x: p.x + deltaX,
            y: p.y + deltaY,
          }))

          const overlap = currentFloor.rooms.some((r) => {
            if (r.id === room.id) return false
            const overlapCheck = checkPolygonsOverlapIntelligent(newPolygon, r.polygon, true)
            return overlapCheck.overlapping // Permet touching et shared edges
          })
          setIsValidPlacement(!overlap)

          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor

            const updatedDoors = floor.doors.map((door) => {
              const wallInfo = findWallSegmentForElement(door.segment, [room])
              if (wallInfo) {
                const oldStart = room.polygon[wallInfo.segmentIndex]
                const oldEnd = room.polygon[(wallInfo.segmentIndex + 1) % room.polygon.length]
                const newStart = newPolygon[wallInfo.segmentIndex]
                const newEnd = newPolygon[(wallInfo.segmentIndex + 1) % newPolygon.length]

                const newSegment = moveElementWithWall(door.segment, oldStart, oldEnd, newStart, newEnd)
                return { ...door, segment: newSegment }
              }
              return door
            })

            const updatedLinks = floor.verticalLinks.map((link) => {
              const wallInfo = findWallSegmentForElement(link.segment, [room])
              if (wallInfo) {
                const oldStart = room.polygon[wallInfo.segmentIndex]
                const oldEnd = room.polygon[(wallInfo.segmentIndex + 1) % room.polygon.length]
                const newStart = newPolygon[wallInfo.segmentIndex]
                const newEnd = newPolygon[(wallInfo.segmentIndex + 1) % newPolygon.length]

                const newSegment = moveElementWithWall(link.segment, oldStart, oldEnd, newStart, newEnd)
                return { ...link, segment: newSegment }
              }
              return link
            })

            const updatedArtworks = floor.artworks.map((artwork) => {
              if (isElementInRoom(artwork, room)) {
                return {
                  ...artwork,
                  xy: [artwork.xy[0] + deltaX, artwork.xy[1] + deltaY] as [number, number],
                }
              }
              return artwork
            })

            // Pour le déplacement de forme entière : simple translation des murs intérieurs
            const updatedWalls = floor.walls.map((wall) => {
              if (wall.roomId === room.id) {
                return {
                  ...wall,
                  segment: [
                    { x: wall.segment[0].x + deltaX, y: wall.segment[0].y + deltaY },
                    { x: wall.segment[1].x + deltaX, y: wall.segment[1].y + deltaY }
                  ] as [Point, Point]
                }
              }
              return wall
            })

            return {
              ...floor,
              rooms: floor.rooms.map((r) => {
                if (r.id !== draggedRoom.roomId) return r
                return { ...r, polygon: newPolygon }
              }),
              doors: updatedDoors,
              verticalLinks: updatedLinks,
              artworks: updatedArtworks,
              walls: updatedWalls,
            }
          })

          // Mise à jour temporaire pendant le drag de pièce
          smartUpdate({ floors: newFloors }, 'temporary')
          setDraggedRoom({ ...draggedRoom, startPos: gridPos })
        }
        setHoveredPoint(gridPos)
        return
      }

      if (draggedWall) {
        const deltaX = gridPos.x - draggedWall.startPos.x
        const deltaY = gridPos.y - draggedWall.startPos.y

        const wall = currentFloor.walls.find((w) => w.id === draggedWall.wallId)
        if (wall) {
          const newSegment: [Point, Point] = [
            { x: wall.segment[0].x + deltaX, y: wall.segment[0].y + deltaY },
            { x: wall.segment[1].x + deltaX, y: wall.segment[1].y + deltaY }
          ]

          // Vérifier que le mur entier reste dans la même pièce
          const originalRoom = currentFloor.rooms.find(r => r.id === wall.roomId)
          if (originalRoom) {
            const tempWall = { ...wall, segment: newSegment }
            const validation = validateWallPlacement(tempWall, currentFloor)
            const isStillInSameRoom = validation.roomId === wall.roomId
            setIsValidPlacement(validation.valid && isStillInSameRoom)

            if (validation.valid && isStillInSameRoom) {
              // Trouver les éléments attachés à ce mur
              const attachedElements = findElementsAttachedToWall(wall, currentFloor)
              
              const newFloors = state.floors.map((floor) => {
                if (floor.id !== state.currentFloorId) return floor
                
                let updatedFloor = {
                  ...floor,
                  walls: floor.walls.map((w) => {
                    if (w.id !== wall.id) return w
                    return { ...w, segment: newSegment }
                  }),
                }

                // Déplacer les éléments attachés avec le mur
                attachedElements.forEach(attached => {
                  if (attached.type === 'door') {
                    updatedFloor.doors = updatedFloor.doors.map(door => {
                      if (door.id !== attached.id) return door
                      return {
                        ...door,
                        segment: [
                          { x: door.segment[0].x + deltaX, y: door.segment[0].y + deltaY },
                          { x: door.segment[1].x + deltaX, y: door.segment[1].y + deltaY }
                        ] as [Point, Point]
                      }
                    })
                  } else if (attached.type === 'verticalLink') {
                    updatedFloor.verticalLinks = updatedFloor.verticalLinks.map(link => {
                      if (link.id !== attached.id) return link
                      return {
                        ...link,
                        segment: [
                          { x: link.segment[0].x + deltaX, y: link.segment[0].y + deltaY },
                          { x: link.segment[1].x + deltaX, y: link.segment[1].y + deltaY }
                        ] as [Point, Point]
                      }
                    })
                  }
                })

                return updatedFloor
              })
              updateState({ floors: newFloors })
            }
          }
          setDraggedWall({ ...draggedWall, startPos: gridPos })
        }
        setHoveredPoint(gridPos)
        return
      }

      if (draggedArtwork) {
        const deltaX = gridPos.x - draggedArtwork.startPos.x
        const deltaY = gridPos.y - draggedArtwork.startPos.y

        const artwork = currentFloor.artworks.find((a) => a.id === draggedArtwork.artworkId)
        if (artwork) {
          const newXY: [number, number] = [
            draggedArtwork.artworkStartPos[0] + deltaX,
            draggedArtwork.artworkStartPos[1] + deltaY,
          ]

          // Check if artwork is in a room
          const inRoom = currentFloor.rooms.some((room) => isArtworkInRoom({ xy: newXY, size: artwork.size }, room))
          setIsValidPlacement(inRoom)

          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor

            return {
              ...floor,
              artworks: floor.artworks.map((a) => {
                if (a.id !== draggedArtwork.artworkId) return a
                return { ...a, xy: newXY }
              }),
            }
          })

          smartUpdate({ floors: newFloors }, 'temporary')
          setDraggedArtwork({ ...draggedArtwork, startPos: gridPos })
        }
        setHoveredPoint(gridPos)
        return
      }

      if (resizingArtwork) {
        const deltaX = gridPos.x - resizingArtwork.startPos.x
        const deltaY = gridPos.y - resizingArtwork.startPos.y

        const original = resizingArtwork.originalArtwork
        const newXY = [...original.xy] as [number, number]
        const newSize = [...(original.size || [1, 1])] as [number, number]

        const handle = resizingArtwork.handle

        if (handle.includes("w")) {
          newXY[0] = original.xy[0] + deltaX
          newSize[0] = Math.max(1, (original.size?.[0] || 1) - deltaX)
        }
        if (handle.includes("e")) {
          newSize[0] = Math.max(1, (original.size?.[0] || 1) + deltaX)
        }
        if (handle.includes("n")) {
          newXY[1] = original.xy[1] + deltaY
          newSize[1] = Math.max(1, (original.size?.[1] || 1) - deltaY)
        }
        if (handle.includes("s")) {
          newSize[1] = Math.max(1, (original.size?.[1] || 1) + deltaY)
        }

        // Check if artwork is in a room
        const inRoom = currentFloor.rooms.some((room) => isArtworkInRoom({ xy: newXY, size: newSize }, room))
        setIsValidPlacement(inRoom)

        const newFloors = state.floors.map((floor) => {
          if (floor.id !== state.currentFloorId) return floor

          return {
            ...floor,
            artworks: floor.artworks.map((a) => {
              if (a.id !== resizingArtwork.artworkId) return a
              return { ...a, xy: newXY, size: newSize }
            }),
          }
        })

        smartUpdate({ floors: newFloors }, 'temporary')
        setHoveredPoint(gridPos)
        return
      }

      if (draggedElement) {
        const snap = snapToWallSegmentWithPosition(gridPos, currentFloor.rooms)
        if (snap) {
          gridPos = snap.point
          setWallSegmentSnap(snap)
        }

        if (attachedWallSegment) {
          // Project mouse position onto the wall segment
          gridPos = projectPointOntoSegment(gridPos, attachedWallSegment.segmentStart, attachedWallSegment.segmentEnd)
        }

        const newFloors = state.floors.map((floor) => {
          if (floor.id !== state.currentFloorId) return floor

          if (draggedElement.type === "door") {
            return {
              ...floor,
              doors: floor.doors.map((door) => {
                if (door.id !== draggedElement.id) return door

                // Mode glissement intelligent sur mur parent
                const parentWall = findParentWall(door.segment, floor.walls)
                
                if (parentWall) {
                  // Glissement le long du mur parent
                  const projectedCenter = projectPointOnWallSegment(
                    gridPos,
                    parentWall.segment,
                    door.width,
                    CONSTRAINTS.door.minClearance
                  )
                  
                  if (projectedCenter) {
                    // Calculer le nouveau segment centré sur la projection
                    const newSegment = calculateElementSegmentOnWall(
                      projectedCenter,
                      parentWall.segment,
                      door.width
                    )
                    
                    if (newSegment) {
                      // Validation du placement
                      const occupied = isWallSegmentOccupied(
                        newSegment[0],
                        newSegment[1],
                        floor.doors.filter((d) => d.id !== door.id),
                        floor.verticalLinks,
                        floor.artworks,
                      )
                      setIsValidPlacement(!occupied)
                      
                      return { ...door, segment: newSegment }
                    }
                  }
                }
                
                // Fallback: déplacement libre d'extrémité
                const newSegment: [Point, Point] =
                  draggedElement.endpoint === "start" ? [gridPos, door.segment[1]] : [door.segment[0], gridPos]

                const width = Math.hypot(newSegment[1].x - newSegment[0].x, newSegment[1].y - newSegment[0].y)

                // Vérifier la taille minimum
                const isMinSizeValid = width >= CONSTRAINTS.door.minWidth

                const occupied = isWallSegmentOccupied(
                  newSegment[0],
                  newSegment[1],
                  floor.doors.filter((d) => d.id !== door.id),
                  floor.verticalLinks,
                  floor.artworks,
                )
                setIsValidPlacement(!occupied && isMinSizeValid)

                return { ...door, segment: newSegment, width }
              }),
            }
          } else if (draggedElement.type === "verticalLink") {
            return {
              ...floor,
              verticalLinks: floor.verticalLinks.map((link) => {
                if (link.id !== draggedElement.id) return link

                // Mode glissement intelligent sur mur parent
                const parentWall = findParentWall(link.segment, floor.walls)
                
                if (parentWall) {
                  // Glissement le long du mur parent
                  const projectedCenter = projectPointOnWallSegment(
                    gridPos,
                    parentWall.segment,
                    link.width,
                    CONSTRAINTS.verticalLink.minClearance
                  )
                  
                  if (projectedCenter) {
                    // Calculer le nouveau segment centré sur la projection
                    const newSegment = calculateElementSegmentOnWall(
                      projectedCenter,
                      parentWall.segment,
                      link.width
                    )
                    
                    if (newSegment) {
                      // Validation du placement
                      const occupied = isWallSegmentOccupied(
                        newSegment[0],
                        newSegment[1],
                        floor.doors,
                        floor.verticalLinks.filter((l) => l.id !== link.id),
                        floor.artworks,
                      )
                      setIsValidPlacement(!occupied)
                      
                      return { ...link, segment: newSegment }
                    }
                  }
                }

                // Fallback: déplacement libre d'extrémité
                const newSegment: [Point, Point] =
                  draggedElement.endpoint === "start" ? [gridPos, link.segment[1]] : [link.segment[0], gridPos]

                const width = Math.hypot(newSegment[1].x - newSegment[0].x, newSegment[1].y - newSegment[0].y)

                // Vérifier la taille minimum
                const isMinSizeValid = width >= CONSTRAINTS.verticalLink.minWidth

                const occupied = isWallSegmentOccupied(
                  newSegment[0],
                  newSegment[1],
                  floor.doors,
                  floor.verticalLinks.filter((l) => l.id !== link.id),
                  floor.artworks,
                )
                setIsValidPlacement(!occupied && isMinSizeValid)

                return { ...link, segment: newSegment, width }
              }),
            }
          } else if (draggedElement.type === "wall") {
            return {
              ...floor,
              walls: floor.walls.map((wall) => {
                if (wall.id !== draggedElement.id) return wall

                const newSegment: [Point, Point] =
                  draggedElement.endpoint === "start" ? [gridPos, wall.segment[1]] : [wall.segment[0], gridPos]

                // Create temporary wall for validation
                const tempWall = { ...wall, segment: newSegment }
                const validation = validateWallPlacement(tempWall, floor)
                setIsValidPlacement(validation.valid)

                return tempWall
              }),
            }
          }

          return floor
        })

        updateState({ floors: newFloors })
        setHoveredPoint(gridPos)
        return
      }

      if (draggedVertex) {
        const room = currentFloor.rooms.find((r) => r.id === draggedVertex.roomId)
        if (!room) return

        const newPolygon = [...room.polygon]
        const oldVertex = newPolygon[draggedVertex.vertexIndex]
        newPolygon[draggedVertex.vertexIndex] = gridPos

        const overlap = currentFloor.rooms.some((r) => {
          if (r.id === room.id) return false
          const overlapCheck = checkPolygonsOverlapIntelligent(newPolygon, r.polygon, true)
          return overlapCheck.overlapping // Permet touching et shared edges
        })
        
        // Créer la nouvelle pièce temporaire pour validation
        const newRoom = { ...room, polygon: newPolygon }
        
        // Vérifier les contraintes des murs attachés à cette pièce (pour déformation de vertex)
        const { updatedWalls, invalidWalls } = updateWallsAttachedToRoom(room, newRoom, currentFloor)
        const hasInvalidWalls = invalidWalls.length > 0
        
        // La position est valide si pas de chevauchement ET tous les murs restent valides
        const isValid = !overlap && !hasInvalidWalls
        setIsValidPlacement(isValid)

        const newFloors = state.floors.map((floor) => {
          if (floor.id !== state.currentFloorId) return floor

          const prevIndex = (draggedVertex.vertexIndex - 1 + room.polygon.length) % room.polygon.length
          const nextIndex = draggedVertex.vertexIndex

          const updatedDoors = floor.doors.map((door) => {
            const wallInfo = findWallSegmentForElement(door.segment, [room])
            if (wallInfo && (wallInfo.segmentIndex === prevIndex || wallInfo.segmentIndex === nextIndex)) {
              const segmentIndex = wallInfo.segmentIndex
              const oldStart = room.polygon[segmentIndex]
              const oldEnd = room.polygon[(segmentIndex + 1) % room.polygon.length]
              const newStart = newPolygon[segmentIndex]
              const newEnd = newPolygon[(segmentIndex + 1) % newPolygon.length]

              const newSegment = moveElementWithWall(door.segment, oldStart, oldEnd, newStart, newEnd)
              return { ...door, segment: newSegment }
            }
            return door
          })

          const updatedLinks = floor.verticalLinks.map((link) => {
            const wallInfo = findWallSegmentForElement(link.segment, [room])
            if (wallInfo && (wallInfo.segmentIndex === prevIndex || wallInfo.segmentIndex === nextIndex)) {
              const segmentIndex = wallInfo.segmentIndex
              const oldStart = room.polygon[segmentIndex]
              const oldEnd = room.polygon[(segmentIndex + 1) % room.polygon.length]
              const newStart = newPolygon[segmentIndex]
              const newEnd = newPolygon[(segmentIndex + 1) % newPolygon.length]

              const newSegment = moveElementWithWall(link.segment, oldStart, oldEnd, newStart, newEnd)
              return { ...link, segment: newSegment }
            }
            return link
          })

          // Utiliser les murs mis à jour avec snap dynamique pour déformation de vertex
          const finalWalls = floor.walls.map((wall) => {
            const updatedWall = updatedWalls.find(w => w.id === wall.id)
            return updatedWall || wall
          })

          return {
            ...floor,
            rooms: floor.rooms.map((r) => {
              if (r.id !== draggedVertex.roomId) return r
              return { ...r, polygon: newPolygon }
            }),
            doors: updatedDoors,
            verticalLinks: updatedLinks,
            walls: finalWalls,
          }
        })

        smartUpdate({ floors: newFloors }, 'temporary')
        setHoveredPoint(gridPos)
        return
      }

      if (state.selectedTool === "door" || state.selectedTool === "stairs" || state.selectedTool === "elevator") {
        const snap = snapToWallSegmentWithPosition(gridPos, currentFloor.rooms)
        setWallSegmentSnap(snap)
        if (snap) {
          gridPos = snap.point
        }
      }

      setHoveredPoint(gridPos)

      if (state.selectedTool === "select") {
        let foundHover = false

        // Priority 1: Check door/link endpoints (highest priority)
        for (const door of currentFloor.doors) {
          const startScreen = worldToScreen(door.segment[0].x * GRID_SIZE, door.segment[0].y * GRID_SIZE)
          const endScreen = worldToScreen(door.segment[1].x * GRID_SIZE, door.segment[1].y * GRID_SIZE)

          const canvas = canvasRef.current
          if (!canvas) continue
          const rect = canvas.getBoundingClientRect()
          const mouseScreenX = e.clientX - rect.left
          const mouseScreenY = e.clientY - rect.top

          const distToStart = Math.hypot(mouseScreenX - startScreen.x, mouseScreenY - startScreen.y)
          const distToEnd = Math.hypot(mouseScreenX - endScreen.x, mouseScreenY - endScreen.y)

          if (distToStart < 25) {
            setHoveredElement({ type: "doorEndpoint", id: door.id, endpoint: "start" })
            foundHover = true
            break
          }
          if (distToEnd < 25) {
            setHoveredElement({ type: "doorEndpoint", id: door.id, endpoint: "end" })
            foundHover = true
            break
          }
        }

        if (!foundHover) {
          for (const link of currentFloor.verticalLinks) {
            const startScreen = worldToScreen(link.segment[0].x * GRID_SIZE, link.segment[0].y * GRID_SIZE)
            const endScreen = worldToScreen(link.segment[1].x * GRID_SIZE, link.segment[1].y * GRID_SIZE)

            const canvas = canvasRef.current
            if (!canvas) continue
            const rect = canvas.getBoundingClientRect()
            const mouseScreenX = e.clientX - rect.left
            const mouseScreenY = e.clientY - rect.top

            const distToStart = Math.hypot(mouseScreenX - startScreen.x, mouseScreenY - startScreen.y)
            const distToEnd = Math.hypot(mouseScreenX - endScreen.x, mouseScreenY - endScreen.y)

            if (distToStart < 25) {
              setHoveredElement({ type: "linkEndpoint", id: link.id, endpoint: "start" })
              foundHover = true
              break
            }
            if (distToEnd < 25) {
              setHoveredElement({ type: "linkEndpoint", id: link.id, endpoint: "end" })
              foundHover = true
              break
            }
          }
        }

        if (!foundHover) {
          for (const wall of currentFloor.walls) {
            const startScreen = worldToScreen(wall.segment[0].x * GRID_SIZE, wall.segment[0].y * GRID_SIZE)
            const endScreen = worldToScreen(wall.segment[1].x * GRID_SIZE, wall.segment[1].y * GRID_SIZE)

            const canvas = canvasRef.current
            if (!canvas) continue
            const rect = canvas.getBoundingClientRect()
            const mouseScreenX = e.clientX - rect.left
            const mouseScreenY = e.clientY - rect.top

            const distToStart = Math.hypot(mouseScreenX - startScreen.x, mouseScreenY - startScreen.y)
            const distToEnd = Math.hypot(mouseScreenX - endScreen.x, mouseScreenY - endScreen.y)

            if (distToStart < 25) {
              setHoveredElement({ type: "wallEndpoint", id: wall.id, endpoint: "start" })
              foundHover = true
              break
            }
            if (distToEnd < 25) {
              setHoveredElement({ type: "wallEndpoint", id: wall.id, endpoint: "end" })
              foundHover = true
              break
            }
          }
        }

        // Priority 2: Check room vertices
        if (!foundHover) {
          for (const room of currentFloor.rooms) {
            for (let i = 0; i < room.polygon.length; i++) {
              const vertex = room.polygon[i]
              const screenVertex = worldToScreen(vertex.x * GRID_SIZE, vertex.y * GRID_SIZE)

              const canvas = canvasRef.current
              if (!canvas) continue
              const rect = canvas.getBoundingClientRect()
              const mouseScreenX = e.clientX - rect.left
              const mouseScreenY = e.clientY - rect.top

              const distance = Math.hypot(screenVertex.x - mouseScreenX, screenVertex.y - mouseScreenY)

              if (distance < 25) {
                setHoveredElement({ type: "vertex", id: room.id, vertexIndex: i })
                foundHover = true
                break
              }
            }
            if (foundHover) break
          }
        }

        // Priority 3: Check artworks
        if (!foundHover) {
          for (const artwork of currentFloor.artworks) {
            const size = artwork.size || [1, 1]
            if (
              gridPos.x >= artwork.xy[0] &&
              gridPos.x <= artwork.xy[0] + size[0] &&
              gridPos.y >= artwork.xy[1] &&
              gridPos.y <= artwork.xy[1] + size[1]
            ) {
              setHoveredElement({ type: "artwork", id: artwork.id })
              foundHover = true
              break
            }
          }
        }

        if (!foundHover) {
          for (const artwork of currentFloor.artworks) {
            const handle = getArtworkResizeHandle(gridPos, artwork)
            if (handle) {
              setHoveredElement({ type: "artwork", id: artwork.id }) // We'll check the handle in mousedown
              foundHover = true
              break
            }
          }
        }

        // Priority 4: Check doors (body)
        if (!foundHover) {
          for (const door of currentFloor.doors) {
            const startScreen = worldToScreen(door.segment[0].x * GRID_SIZE, door.segment[0].y * GRID_SIZE)
            const endScreen = worldToScreen(door.segment[1].x * GRID_SIZE, door.segment[1].y * GRID_SIZE)

            const canvas = canvasRef.current
            if (!canvas) continue
            const rect = canvas.getBoundingClientRect()
            const mouseScreenX = e.clientX - rect.left
            const mouseScreenY = e.clientY - rect.top

            const distToLine =
              Math.abs(
                (endScreen.y - startScreen.y) * mouseScreenX -
                  (endScreen.x - startScreen.x) * mouseScreenY +
                  endScreen.x * startScreen.y -
                  endScreen.y * startScreen.x,
              ) / Math.hypot(endScreen.y - startScreen.y, endScreen.x - startScreen.x)

            if (distToLine < 15) {
              setHoveredElement({ type: "door", id: door.id })
              foundHover = true
              break
            }
          }
        }

        // Priority 5: Check vertical links (body)
        if (!foundHover) {
          for (const link of currentFloor.verticalLinks) {
            const startScreen = worldToScreen(link.segment[0].x * GRID_SIZE, link.segment[0].y * GRID_SIZE)
            const endScreen = worldToScreen(link.segment[1].x * GRID_SIZE, link.segment[1].y * GRID_SIZE)

            const canvas = canvasRef.current
            if (!canvas) continue
            const rect = canvas.getBoundingClientRect()
            const mouseScreenX = e.clientX - rect.left
            const mouseScreenY = e.clientY - rect.top

            const distToLine =
              Math.abs(
                (endScreen.y - startScreen.y) * mouseScreenX -
                  (endScreen.x - startScreen.x) * mouseScreenY +
                  endScreen.x * startScreen.y -
                  endScreen.y * startScreen.x,
              ) / Math.hypot(endScreen.y - startScreen.y, endScreen.x - startScreen.x)

            if (distToLine < 15) {
              setHoveredElement({ type: "verticalLink", id: link.id })
              foundHover = true
              break
            }
          }
        }

        // Priority 6: Check walls (body)
        if (!foundHover) {
          for (const wall of currentFloor.walls) {
            const startScreen = worldToScreen(wall.segment[0].x * GRID_SIZE, wall.segment[0].y * GRID_SIZE)
            const endScreen = worldToScreen(wall.segment[1].x * GRID_SIZE, wall.segment[1].y * GRID_SIZE)

            const canvas = canvasRef.current
            if (!canvas) continue
            const rect = canvas.getBoundingClientRect()
            const mouseScreenX = e.clientX - rect.left
            const mouseScreenY = e.clientY - rect.top

            // Calculer la distance à la ligne + épaisseur du mur
            const thicknessPixels = (wall.thickness || 0.15) * GRID_SIZE * state.zoom
            const distToLine =
              Math.abs(
                (endScreen.y - startScreen.y) * mouseScreenX -
                  (endScreen.x - startScreen.x) * mouseScreenY +
                  endScreen.x * startScreen.y -
                  endScreen.y * startScreen.x,
              ) / Math.hypot(endScreen.y - startScreen.y, endScreen.x - startScreen.x)

            if (distToLine < thicknessPixels / 2 + 5) {
              setHoveredElement({ type: "wall", id: wall.id })
              foundHover = true
              break
            }
          }
        }

        // Priority 7: Check rooms (body)
        if (!foundHover) {
          for (const room of currentFloor.rooms) {
            if (isPointInPolygon(gridPos, room.polygon)) {
              setHoveredElement({ type: "room", id: room.id })
              foundHover = true
              break
            }
          }
        }

        if (!foundHover) {
          setHoveredElement(null)
        }
      }

      validatePlacement(state.selectedTool, gridPos, drawStartPoint || undefined)
    },
    [
      state,
      currentFloor,
      draggedRoom,
      draggedWall,
      draggedElement,
      draggedVertex,
      draggedArtwork, // Add to dependencies
      resizingArtwork, // Add to dependencies
      attachedWallSegment, // Add to dependencies
      drawStartPoint,
      selectionBox,
      screenToWorld,
      worldToScreen,
      updateState,
      validatePlacement,
    ],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1) {
        updateState({ isPanning: true })
        return
      }

      if (e.button === 2) return

      const worldPos = screenToWorld(e.clientX, e.clientY)
      const gridPos = snapToGrid(worldPos, GRID_SIZE)

      if (state.selectedTool === "select") {
        if (!hoveredElement) {
          // Désélectionner tout quand on clique sur le grid vide
          updateState({
            selectedElementId: null,
            selectedElementType: null,
            selectedElements: [],
          })
          setSelectionBox({
            start: worldPos,
            end: worldPos,
          })
          return
        }

        if (hoveredElement?.type === "artwork") {
          const artwork = currentFloor.artworks.find((a) => a.id === hoveredElement.id)
          if (artwork) {
            const handle = getArtworkResizeHandle(gridPos, artwork)
            if (handle) {
              setDragStartState({ type: "artwork", originalData: { ...artwork } })
              setResizingArtwork({
                artworkId: artwork.id,
                handle,
                startPos: gridPos,
                originalArtwork: artwork,
              })
              setIsValidPlacement(true)
              return
            }

            // Otherwise, start dragging the artwork
            setDragStartState({ type: "artwork", originalData: { ...artwork } })
            setDraggedArtwork({
              artworkId: artwork.id,
              startPos: gridPos,
              artworkStartPos: [artwork.xy[0], artwork.xy[1]],
            })
            setIsValidPlacement(true)
            updateState({ selectedElementId: artwork.id, selectedElementType: "artwork" })
            return
          }
        }

        if (hoveredElement?.type === "doorEndpoint") {
          const door = currentFloor.doors.find((d) => d.id === hoveredElement.id)
          if (door) {
            const wallInfo = findWallSegmentForElement(door.segment, currentFloor.rooms)
            if (wallInfo) {
              const room = currentFloor.rooms.find((r) => r.id === wallInfo.roomId)
              if (room) {
                const segmentStart = room.polygon[wallInfo.segmentIndex]
                const segmentEnd = room.polygon[(wallInfo.segmentIndex + 1) % room.polygon.length]
                setAttachedWallSegment({ segmentStart, segmentEnd })
              }
            }

            setDragStartState({ type: "door", originalData: { ...door } })
            setDraggedElement({
              type: "door",
              id: door.id,
              endpoint: hoveredElement.endpoint!,
            })
            setIsValidPlacement(true)
          }
          return
        }

        if (hoveredElement?.type === "linkEndpoint") {
          const link = currentFloor.verticalLinks.find((l) => l.id === hoveredElement.id)
          if (link) {
            const wallInfo = findWallSegmentForElement(link.segment, currentFloor.rooms)
            if (wallInfo) {
              const room = currentFloor.rooms.find((r) => r.id === wallInfo.roomId)
              if (room) {
                const segmentStart = room.polygon[wallInfo.segmentIndex]
                const segmentEnd = room.polygon[(wallInfo.segmentIndex + 1) % room.polygon.length]
                setAttachedWallSegment({ segmentStart, segmentEnd })
              }
            }

            setDragStartState({ type: "verticalLink", originalData: { ...link } })
            setDraggedElement({
              type: "verticalLink",
              id: link.id,
              endpoint: hoveredElement.endpoint!,
            })
            setIsValidPlacement(true)
          }
          return
        }

        if (hoveredElement?.type === "wallEndpoint") {
          const wall = currentFloor.walls.find((w) => w.id === hoveredElement.id)
          if (wall) {
            setDragStartState({ type: "wall", originalData: { ...wall } })
            setDraggedElement({
              type: "wall",
              id: wall.id,
              endpoint: hoveredElement.endpoint!,
            })
            setIsValidPlacement(true)
          }
          return
        }

        if (hoveredElement?.type === "vertex") {
          const room = currentFloor.rooms.find((r) => r.id === hoveredElement.id)
          if (room) {
            setDragStartState({ type: "vertex", originalData: { roomId: room.id, polygon: [...room.polygon] } })
            setDraggedVertex({ roomId: hoveredElement.id, vertexIndex: hoveredElement.vertexIndex! })
            setIsValidPlacement(true)
          }
          return
        }

        if (hoveredElement?.type === "artwork") {
          updateState({ selectedElementId: hoveredElement.id, selectedElementType: "artwork" })
          return
        }

        if (hoveredElement?.type === "door") {
          updateState({ selectedElementId: hoveredElement.id, selectedElementType: "door" })
          return
        }

        if (hoveredElement?.type === "verticalLink") {
          updateState({ selectedElementId: hoveredElement.id, selectedElementType: "verticalLink" })
          return
        }

        if (hoveredElement?.type === "wall") {
          const wall = currentFloor.walls.find((w) => w.id === hoveredElement.id)
          if (wall) {
            setDragStartState({ type: "wall", originalData: { ...wall } })
            setDraggedWall({
              wallId: wall.id,
              startPos: gridPos,
              wallStartPos: wall.segment[0],
            })
            setIsValidPlacement(true)
            updateState({ selectedElementId: wall.id, selectedElementType: "wall" })
          }
          return
        }

        if (hoveredElement?.type === "room") {
          const room = currentFloor.rooms.find((r) => r.id === hoveredElement.id)
          if (room) {
            setDragStartState({ type: "room", originalData: { ...room } })
            setDraggedRoom({
              roomId: room.id,
              startPos: gridPos,
              roomStartPos: room.polygon[0],
            })
            setActionInProgress("Déplacer pièce")
            setIsValidPlacement(true)
            updateState({ selectedElementId: room.id, selectedElementType: "room" })
          }
          return
        }

        updateState({ selectedElementId: null, selectedElementType: null })
        return
      }

      if (state.selectedTool === "room") {
        if (state.currentPolygon.length >= 3) {
          const firstPoint = state.currentPolygon[0]
          const distance = Math.hypot(gridPos.x - firstPoint.x, gridPos.y - firstPoint.y)

          // Zone de fermeture plus tolérante et intelligente
          const closeThreshold = 0.5
          if (distance < closeThreshold) {
            // Créer la pièce temporaire pour validation avec géométrie optimisée
            const optimizedPolygon = [...state.currentPolygon]
            
            // Supprimer les points trop proches pour éviter la dégénérescence
            const cleanedPolygon = optimizedPolygon.filter((point, index) => {
              if (index === 0) return true
              const prevPoint = optimizedPolygon[index - 1]
              const dist = Math.hypot(point.x - prevPoint.x, point.y - prevPoint.y)
              return dist > 0.1 // Seuil minimum entre points
            })

            const tempRoom: Room = {
              id: `room-${Date.now()}`,
              polygon: cleanedPolygon,
            }

            // Validation intelligente avec gestion des avertissements
            const validationResult = validateRoomGeometry(tempRoom, {
              floor: currentFloor,
              strictMode: false, // Mode tolérant pour polygones libres
              allowWarnings: true // Permettre les avertissements
            })

            // Bloquer seulement les erreurs critiques, pas les avertissements
            if (!validationResult.valid && validationResult.severity === 'error') {
              console.warn("Création de pièce bloquée (erreur critique):", validationResult.message)
              return
            }

            // Afficher les avertissements sans bloquer
            if (validationResult.severity === 'warning') {
              console.info("Avertissement création pièce:", validationResult.message)
            }

            // Si validation réussit, créer la pièce
            const newFloors = state.floors.map((floor) =>
              floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, tempRoom] } : floor,
            )

            finalizeAction({
              floors: newFloors,
              currentPolygon: [],
            }, "Créer pièce polygonale")
            return
          }
        }

        // Éviter les points en double ou trop proches
        const lastPoint = state.currentPolygon[state.currentPolygon.length - 1]
        const minDistance = 0.2 // Distance minimale entre points
        
        if (!lastPoint || Math.hypot(gridPos.x - lastPoint.x, gridPos.y - lastPoint.y) >= minDistance) {
          // Validation préventive - éviter les auto-intersections
          const newPolygon = [...state.currentPolygon, gridPos]
          
          if (newPolygon.length >= 3) {
            const tempRoom: Room = {
              id: `temp-validation-${Date.now()}`,
              polygon: newPolygon,
            }
            
            // Validation légère pour éviter les géométries dégénérées
            const validationResult = validateRoomGeometry(tempRoom, {
              floor: currentFloor,
              strictMode: false
            })
            
            // Si le nouveau point cause des problèmes, ne pas l'ajouter
            if (!validationResult.valid && validationResult.message?.includes("intersection")) {
              console.warn("Point rejeté - auto-intersection détectée")
              return
            }
          }
          
          updateState({
            currentPolygon: newPolygon,
          })
        }
        return
      }

      if (
        state.selectedTool === "rectangle" ||
        state.selectedTool === "circle" ||
        state.selectedTool === "triangle" ||
        state.selectedTool === "arc" ||
        state.selectedTool === "artwork"
      ) {
        setDrawStartPoint(gridPos)
        setIsDragging(true)
        return
      }

      if (state.selectedTool === "door" || state.selectedTool === "stairs" || state.selectedTool === "elevator") {
        if (wallSegmentSnap) {
          setDrawStartPoint(gridPos)
          setIsDragging(true)
        }
        return
      }

      if (state.selectedTool === "wall") {
        setDrawStartPoint(gridPos)
        setIsDragging(true)
        return
      }
    },
    [state, currentFloor, hoveredElement, wallSegmentSnap, screenToWorld, worldToScreen, updateState],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1) {
        updateState({ isPanning: false })
        return
      }

      if (selectionBox) {
        const minX = Math.min(selectionBox.start.x, selectionBox.end.x) / GRID_SIZE
        const maxX = Math.max(selectionBox.start.x, selectionBox.end.x) / GRID_SIZE
        const minY = Math.min(selectionBox.start.y, selectionBox.end.y) / GRID_SIZE
        const maxY = Math.max(selectionBox.start.y, selectionBox.end.y) / GRID_SIZE

        const selectedElements: Array<{
          id: string
          type: "room" | "artwork" | "door" | "verticalLink" | "wall" | "vertex"
          vertexIndex?: number
          roomId?: string
        }> = []

        currentFloor.rooms.forEach((room) => {
          room.polygon.forEach((vertex, index) => {
            if (vertex.x >= minX && vertex.x <= maxX && vertex.y >= minY && vertex.y <= maxY) {
              selectedElements.push({
                id: room.id,
                type: "vertex",
                vertexIndex: index,
                roomId: room.id,
              })
            }
          })
        })

        currentFloor.rooms.forEach((room) => {
          const centerX = room.polygon.reduce((sum, p) => sum + p.x, 0) / room.polygon.length
          const centerY = room.polygon.reduce((sum, p) => sum + p.y, 0) / room.polygon.length
          if (centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY) {
            selectedElements.push({ id: room.id, type: "room" })
          }
        })

        currentFloor.artworks.forEach((artwork) => {
          if (artwork.xy[0] >= minX && artwork.xy[0] <= maxX && artwork.xy[1] >= minY && artwork.xy[1] <= maxY) {
            selectedElements.push({ id: artwork.id, type: "artwork" })
          }
        })

        currentFloor.doors.forEach((door) => {
          const midX = (door.segment[0].x + door.segment[1].x) / 2
          const midY = (door.segment[0].y + door.segment[1].y) / 2
          if (midX >= minX && midX <= maxX && midY >= minY && midY <= maxY) {
            selectedElements.push({ id: door.id, type: "door" })
          }
        })

        currentFloor.verticalLinks.forEach((link) => {
          const midX = (link.segment[0].x + link.segment[1].x) / 2
          const midY = (link.segment[0].y + link.segment[1].y) / 2
          if (midX >= minX && midX <= maxX && midY >= minY && midY <= maxY) {
            selectedElements.push({ id: link.id, type: "verticalLink" })
          }
        })

        currentFloor.walls.forEach((wall) => {
          // Vérifier si les deux extrémités du mur sont dans la sélection
          const startInSelection = wall.segment[0].x >= minX && wall.segment[0].x <= maxX && 
                                  wall.segment[0].y >= minY && wall.segment[0].y <= maxY
          const endInSelection = wall.segment[1].x >= minX && wall.segment[1].x <= maxX && 
                                wall.segment[1].y >= minY && wall.segment[1].y <= maxY
          
          if (startInSelection && endInSelection) {
            // Tout le mur est sélectionné
            selectedElements.push({ id: wall.id, type: "wall" })
          } else {
            // Ajouter les points individuels si seulement partiellement sélectionné
            if (startInSelection) {
              selectedElements.push({ id: wall.id, type: "vertex", vertexIndex: 0, roomId: wall.id })
            }
            if (endInSelection) {
              selectedElements.push({ id: wall.id, type: "vertex", vertexIndex: 1, roomId: wall.id })
            }
          }
        })

        // Logique intelligente : si tous les points d'un élément sont sélectionnés, sélectionner l'élément complet
        const processIntelligentSelection = (elements: typeof selectedElements) => {
          const elementGroups = new Map<string, { type: string; vertices: number[]; total: number }>()
          
          // Grouper les vertices par élément
          elements.forEach(el => {
            if (el.type === "vertex" && el.vertexIndex !== undefined) {
              const key = el.roomId || el.id
              if (!elementGroups.has(key)) {
                // Déterminer le nombre total de vertices pour cet élément
                let totalVertices = 0
                if (el.roomId && el.roomId !== el.id) {
                  // C'est un vertex de room
                  const room = currentFloor.rooms.find(r => r.id === el.roomId)
                  totalVertices = room ? room.polygon.length : 0
                } else {
                  // C'est un vertex de mur (2 points)
                  totalVertices = 2
                }
                
                elementGroups.set(key, { 
                  type: el.roomId && el.roomId !== el.id ? "room" : "wall", 
                  vertices: [], 
                  total: totalVertices 
                })
              }
              elementGroups.get(key)!.vertices.push(el.vertexIndex)
            }
          })
          
          // Remplacer les vertices par l'élément complet si tous sont sélectionnés
          const finalElements = elements.filter(el => !(el.type === "vertex"))
          
          elementGroups.forEach((group, elementId) => {
            if (group.vertices.length === group.total) {
              // Tous les vertices sont sélectionnés, ajouter l'élément complet
              finalElements.push({ id: elementId, type: group.type as any })
            } else {
              // Garder seulement les vertices sélectionnés
              group.vertices.forEach(vertexIndex => {
                finalElements.push({ 
                  id: elementId, 
                  type: "vertex" as any, 
                  vertexIndex, 
                  roomId: group.type === "room" ? elementId : elementId 
                })
              })
            }
          })
          
          return finalElements
        }

        const intelligentSelection = processIntelligentSelection(selectedElements)
        updateState({ selectedElements: intelligentSelection })
        setSelectionBox(null)
        return
      }

      if (draggedArtwork) {
        if (!isValidPlacement && dragStartState?.type === "artwork") {
          const originalData = dragStartState.originalData
          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor
            return {
              ...floor,
              artworks: floor.artworks.map((artwork) => {
                if (artwork.id === originalData.id) return originalData
                return artwork
              }),
            }
          })
          finalizeAction({ floors: newFloors }, "Annuler déplacement œuvre")
        } else if (isValidPlacement) {
          // Finaliser le déplacement réussi
          finalizeAction({ floors: state.floors }, "Déplacer œuvre d'art")
        }
        setDraggedArtwork(null)
        setDragStartState(null)
        setIsValidPlacement(true)
        return
      }

      if (resizingArtwork) {
        if (!isValidPlacement && dragStartState?.type === "artwork") {
          const originalData = dragStartState.originalData
          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor
            return {
              ...floor,
              artworks: floor.artworks.map((artwork) => {
                if (artwork.id === originalData.id) return originalData
                return artwork
              }),
            }
          })
          finalizeAction({ floors: newFloors }, "Annuler redimensionnement œuvre")
        } else if (isValidPlacement) {
          // Finaliser le redimensionnement réussi
          finalizeAction({ floors: state.floors }, "Redimensionner œuvre d'art")
        }
        setResizingArtwork(null)
        setDragStartState(null)
        setIsValidPlacement(true)
        return
      }

      if (draggedVertex) {
        if (!isValidPlacement && dragStartState?.type === "vertex") {
          const originalData = dragStartState.originalData
          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor
            return {
              ...floor,
              rooms: floor.rooms.map((room) => {
                if (room.id === originalData.roomId) {
                  return { ...room, polygon: originalData.polygon }
                }
                return room
              }),
            }
          })
          finalizeAction({ floors: newFloors }, "Annuler déplacement vertex")
        } else if (isValidPlacement) {
          // Finaliser le déplacement de vertex réussi
          finalizeAction({ floors: state.floors }, "Déplacer vertex de pièce")
        }
        setDraggedVertex(null)
        setDragStartState(null)
        setIsValidPlacement(true)
        return
      }

      if (draggedRoom) {
        if (!isValidPlacement && dragStartState?.type === "room") {
          const originalData = dragStartState.originalData
          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor
            return {
              ...floor,
              rooms: floor.rooms.map((room) => {
                if (room.id === originalData.id) return originalData
                return room
              }),
            }
          })
          smartUpdate({ floors: newFloors }, 'final', "Annuler déplacement pièce")
        } else if (isValidPlacement && actionInProgress) {
          // Finaliser l'action réussie avec l'état actuel
          smartUpdate({ floors: state.floors }, 'final', actionInProgress)
        }
        setDraggedRoom(null)
        setDragStartState(null)
        setActionInProgress(null)
        setIsValidPlacement(true)
        return
      }

      if (draggedWall) {
        if (!isValidPlacement && dragStartState?.type === "wall") {
          const originalData = dragStartState.originalData
          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor
            return {
              ...floor,
              walls: floor.walls.map((wall) => {
                if (wall.id === originalData.id) return originalData
                return wall
              }),
            }
          })
          finalizeAction({ floors: newFloors }, "Annuler déplacement mur")
        } else if (isValidPlacement) {
          // Finaliser le déplacement de mur réussi
          finalizeAction({ floors: state.floors }, "Déplacer mur")
        }
        setDraggedWall(null)
        setDragStartState(null)
        setIsValidPlacement(true)
        return
      }

      if (draggedElement) {
        if (!isValidPlacement && dragStartState) {
          const originalData = dragStartState.originalData
          const newFloors = state.floors.map((floor) => {
            if (floor.id !== state.currentFloorId) return floor

            if (dragStartState.type === "door") {
              return {
                ...floor,
                doors: floor.doors.map((door) => {
                  if (door.id === originalData.id) return originalData
                  return door
                }),
              }
            } else if (dragStartState.type === "verticalLink") {
              return {
                ...floor,
                verticalLinks: floor.verticalLinks.map((link) => {
                  if (link.id === originalData.id) return originalData
                  return link
                }),
              }
            } else if (dragStartState.type === "wall") {
              return {
                ...floor,
                walls: floor.walls.map((wall) => {
                  if (wall.id === originalData.id) return originalData
                  return wall
                }),
              }
            }
            return floor
          })
          const actionName = dragStartState.type === "door" ? "Annuler déplacement porte" :
                           dragStartState.type === "verticalLink" ? "Annuler déplacement liaison" :
                           "Annuler déplacement mur"
          finalizeAction({ floors: newFloors }, actionName)
        } else if (isValidPlacement) {
          // Finaliser le déplacement d'élément réussi
          const actionName = draggedElement.type === "door" ? "Déplacer porte" :
                           draggedElement.type === "verticalLink" ? "Déplacer liaison verticale" :
                           "Déplacer extrémité de mur"
          finalizeAction({ floors: state.floors }, actionName)
        }
        setDraggedElement(null)
        setDragStartState(null)
        setAttachedWallSegment(null)
        setIsValidPlacement(true)
        return
      }

      if (!isDragging || !drawStartPoint || !hoveredPoint) {
        setIsDragging(false)
        setDrawStartPoint(null)
        return
      }

      if (!isValidPlacement) {
        setIsDragging(false)
        setDrawStartPoint(null)
        setCreationPreview(null)
        return
      }

      const worldPos = screenToWorld(e.clientX, e.clientY)
      const gridPos = snapToGrid(worldPos, GRID_SIZE)

      // Vérification distance minimum de drag pour éviter création accidentelle
      const dragDistance = Math.hypot(
        gridPos.x - drawStartPoint.x,
        gridPos.y - drawStartPoint.y
      )
      
      if (dragDistance < CONSTRAINTS.creation.minDragDistance) {
        console.warn("Distance de drag insuffisante pour créer une forme:", dragDistance)
        setIsDragging(false)
        setDrawStartPoint(null)
        setCreationPreview(null)
        return
      }

      if (state.selectedTool === "rectangle") {
        const tempRoom: Room = {
          id: `room-${Date.now()}`,
          polygon: [
            drawStartPoint,
            { x: gridPos.x, y: drawStartPoint.y },
            gridPos,
            { x: drawStartPoint.x, y: gridPos.y },
          ],
        }

        // Validation intelligente pour rectangles
        const validationResult = validateRoomGeometry(tempRoom, {
          floor: currentFloor,
          strictMode: false, // Plus tolérant
          allowWarnings: true
        })

        // Bloquer seulement les erreurs critiques
        if (!validationResult.valid && validationResult.severity === 'error') {
          console.warn("Création rectangulaire bloquée (erreur critique):", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        // Log des avertissements sans bloquer
        if (validationResult.severity === 'warning') {
          console.info("Avertissement rectangle:", validationResult.message)
        }

        // Si validation réussit, créer la pièce
        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, tempRoom] } : floor,
        )

        finalizeAction({ floors: newFloors }, "Créer pièce rectangulaire")
      } else if (state.selectedTool === "circle") {
        const radius = Math.max(Math.abs(gridPos.x - drawStartPoint.x), Math.abs(gridPos.y - drawStartPoint.y))
        const polygon = createCirclePolygon(drawStartPoint, radius)

        const tempRoom: Room = {
          id: `room-${Date.now()}`,
          polygon,
        }

        // Validation intelligente pour cercles
        const validationResult = validateRoomGeometry(tempRoom, {
          floor: currentFloor,
          strictMode: false,
          allowWarnings: true
        })

        // Bloquer seulement erreurs critiques
        if (!validationResult.valid && validationResult.severity === 'error') {
          console.warn("Création circulaire bloquée (erreur critique):", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        if (validationResult.severity === 'warning') {
          console.info("Avertissement cercle:", validationResult.message)
        }

        // Si validation réussit, créer la pièce
        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, tempRoom] } : floor,
        )

        smartUpdate({ floors: newFloors }, 'final', "Créer pièce circulaire")
      } else if (state.selectedTool === "triangle") {
        const polygon = createTrianglePolygon(drawStartPoint, gridPos)

        const tempRoom: Room = {
          id: `room-${Date.now()}`,
          polygon,
        }

        // Validation intelligente pour triangles
        const validationResult = validateRoomGeometry(tempRoom, {
          floor: currentFloor,
          strictMode: false,
          allowWarnings: true
        })

        // Bloquer seulement erreurs critiques
        if (!validationResult.valid && validationResult.severity === 'error') {
          console.warn("Création triangulaire bloquée (erreur critique):", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        if (validationResult.severity === 'warning') {
          console.info("Avertissement triangle:", validationResult.message)
        }

        // Si validation réussit, créer la pièce
        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, tempRoom] } : floor,
        )

        smartUpdate({ floors: newFloors }, 'final', "Créer pièce triangulaire")
      } else if (state.selectedTool === "arc") {
        const polygon = createArcPolygon(drawStartPoint, gridPos)

        const tempRoom: Room = {
          id: `room-${Date.now()}`,
          polygon,
        }

        // Validation intelligente pour arcs
        const validationResult = validateRoomGeometry(tempRoom, {
          floor: currentFloor,
          strictMode: false,
          allowWarnings: true
        })

        // Bloquer seulement erreurs critiques
        if (!validationResult.valid && validationResult.severity === 'error') {
          console.warn("Création arc bloquée (erreur critique):", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        if (validationResult.severity === 'warning') {
          console.info("Avertissement arc:", validationResult.message)
        }

        // Si validation réussit, créer la pièce
        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, tempRoom] } : floor,
        )

        smartUpdate({ floors: newFloors }, 'final', "Créer pièce arc")
      } else if (state.selectedTool === "artwork") {
        const minX = Math.min(drawStartPoint.x, gridPos.x)
        const minY = Math.min(drawStartPoint.y, gridPos.y)
        const width = Math.abs(gridPos.x - drawStartPoint.x)
        const height = Math.abs(gridPos.y - drawStartPoint.y)

        // Validation taille minimum œuvre d'art
        if (width < CONSTRAINTS.artwork.minWidth || height < CONSTRAINTS.artwork.minHeight) {
          console.warn("Œuvre d'art trop petite:", { width, height }, "< minimum:", { 
            minWidth: CONSTRAINTS.artwork.minWidth, 
            minHeight: CONSTRAINTS.artwork.minHeight 
          })
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        const tempArtwork: Artwork = {
          id: `artwork-${Date.now()}`,
          xy: [minX, minY],
          size: [width, height],
          name: "New Artwork",
          pdf_id: "",
        }

        // Validation intelligente placement œuvre d'art
        const validationResult = validateArtworkPlacement(tempArtwork, {
          floor: currentFloor,
          strictMode: false,
          allowWarnings: true
        })

        // Bloquer seulement erreurs critiques
        if (!validationResult.valid && validationResult.severity === 'error') {
          console.warn("Placement œuvre d'art invalide:", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, artworks: [...floor.artworks, tempArtwork] } : floor,
        )

        finalizeAction({ floors: newFloors }, "Créer œuvre d'art")
      } else if (state.selectedTool === "door" && wallSegmentSnap && creationPreview) {
        const doorWidth = Math.hypot(
          creationPreview.end.x - creationPreview.start.x,
          creationPreview.end.y - creationPreview.start.y,
        )

        // Validation taille minimum porte
        if (doorWidth < CONSTRAINTS.door.minWidth) {
          console.warn("Porte trop petite:", doorWidth, "< minimum", CONSTRAINTS.door.minWidth)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        const tempDoor: Door = {
          id: `door-${Date.now()}`,
          room_a: "",
          room_b: "",
          segment: [creationPreview.start, creationPreview.end],
          width: doorWidth,
        }

        // Validation stricte porte
        const validationResult = validateDoor(tempDoor)

        if (!validationResult.valid) {
          console.warn("Porte invalide:", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, doors: [...floor.doors, tempDoor] } : floor,
        )

        finalizeAction({ floors: newFloors }, "Créer porte")
      } else if (
        (state.selectedTool === "stairs" || state.selectedTool === "elevator") &&
        wallSegmentSnap &&
        creationPreview
      ) {
        const linkWidth = Math.hypot(
          creationPreview.end.x - creationPreview.start.x,
          creationPreview.end.y - creationPreview.start.y,
        )

        // Validation taille minimum liaison verticale
        if (linkWidth < CONSTRAINTS.verticalLink.minWidth) {
          console.warn("Liaison verticale trop petite:", linkWidth, "< minimum", CONSTRAINTS.verticalLink.minWidth)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        const tempLink: VerticalLink = {
          id: `${state.selectedTool}-${Date.now()}`,
          type: state.selectedTool,
          segment: [creationPreview.start, creationPreview.end],
          width: linkWidth,
          direction: "both",
          to_floor: "",
        }

        // Validation stricte liaison verticale
        const validationResult = validateVerticalLink(tempLink)

        if (!validationResult.valid) {
          console.warn("Liaison verticale invalide:", validationResult.message)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, verticalLinks: [...floor.verticalLinks, tempLink] } : floor,
        )

        const actionName = state.selectedTool === "stairs" ? "Créer escalier" : "Créer ascenseur"
        finalizeAction({ floors: newFloors }, actionName)
      } else if (state.selectedTool === "wall" && drawStartPoint && hoveredPoint && isValidPlacement) {
        // Appliquer le snap sur les murs de pièce pour la création finale
        const startSnap = findRoomWallSnapPoint(drawStartPoint, currentFloor)
        const endSnap = findRoomWallSnapPoint(hoveredPoint, currentFloor)
        
        const actualStart = startSnap ? startSnap.snapPoint : drawStartPoint
        const actualEnd = endSnap ? endSnap.snapPoint : hoveredPoint
        
        // Validation taille minimum du mur
        const wallLength = Math.hypot(
          actualEnd.x - actualStart.x,
          actualEnd.y - actualStart.y
        )
        
        if (wallLength < CONSTRAINTS.wall.minLength) {
          console.warn("Mur trop court:", wallLength, "< minimum", CONSTRAINTS.wall.minLength)
          setIsDragging(false)
          setDrawStartPoint(null)
          setCreationPreview(null)
          return
        }
        
        const newWall = createWallInRoom(actualStart, actualEnd, currentFloor)
        
        if (newWall) {
          const newFloors = state.floors.map((floor) =>
            floor.id === state.currentFloorId ? { ...floor, walls: [...floor.walls, newWall] } : floor,
          )

          finalizeAction({ floors: newFloors }, "Créer mur")
        }
      }

      setIsDragging(false)
      setDrawStartPoint(null)
      setCreationPreview(null)
    },
    [
      isDragging,
      drawStartPoint,
      hoveredPoint,
      isValidPlacement,
      state,
      currentFloor,
      wallSegmentSnap,
      creationPreview,
      draggedVertex,
      draggedRoom,
      draggedWall,
      draggedElement,
      draggedArtwork, // Add to dependencies
      resizingArtwork, // Add to dependencies
      dragStartState,
      selectionBox,
      screenToWorld,
      updateState,
    ],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()

      if (hoveredElement) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: hoveredElement.type as any,
          elementId: hoveredElement.id,
        })
      } else {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: "background",
        })
      }
    },
    [hoveredElement],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (hoveredElement?.type === "verticalLink" && onNavigateToFloor) {
        const link = currentFloor.verticalLinks.find((l) => l.id === hoveredElement.id)
        if (link?.to_floor) {
          onNavigateToFloor(link.to_floor)
        }
      } else if (hoveredElement?.type === "artwork" && onArtworkDoubleClick) {
        onArtworkDoubleClick(hoveredElement.id)
      }
    },
    [hoveredElement, currentFloor, onNavigateToFloor, onArtworkDoubleClick],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault()

      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(5, state.zoom * delta))

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const worldX = (mouseX - state.pan.x) / state.zoom
      const worldY = (mouseY - state.pan.y) / state.zoom

      const newPanX = mouseX - worldX * newZoom
      const newPanY = mouseY - worldY * newZoom

      updateState({
        zoom: newZoom,
        pan: { x: newPanX, y: newPanY },
      })
    },
    [state.zoom, state.pan, updateState],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      render()
    })

    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [render])

  useEffect(() => {
    render()
  }, [render])

  // Vérification de cohérence globale en temps réel
  useEffect(() => {
    const checkCoherence = () => {
      const status = quickCoherenceCheck(currentFloor)
      setCoherenceStatus(status)
    }

    // Vérification avec debounce pour éviter les calculs excessifs
    const timeoutId = setTimeout(checkCoherence, 300)
    return () => clearTimeout(timeoutId)
  }, [currentFloor])

  useEffect(() => {
    const animate = () => {
      render()
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [render])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className="cursor-crosshair"
        style={{ cursor: state.isPanning ? "grabbing" : state.selectedTool === "select" ? "default" : "crosshair" }}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          elementId={contextMenu.elementId}
          onClose={() => setContextMenu(null)}
          state={state}
          updateState={updateState}
          saveToHistory={saveToHistory || (() => {})}
          currentFloor={currentFloor}
          onNavigateToFloor={onNavigateToFloor}
        />
      )}

      {/* Indicateur de cohérence globale */}
      <div className="absolute top-4 right-4 z-10">
        <div 
          className={`
            px-3 py-2 rounded-lg shadow-lg text-sm font-medium
            ${coherenceStatus.isValid 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
            }
          `}
          title={
            coherenceStatus.isValid 
              ? 'Plan cohérent - Aucun problème détecté'
              : `${coherenceStatus.issuesCount} problème(s) de cohérence détecté(s)`
          }
        >
          <div className="flex items-center gap-2">
            <div 
              className={`
                w-2 h-2 rounded-full
                ${coherenceStatus.isValid ? 'bg-green-500' : 'bg-red-500'}
              `}
            />
            <span>
              {coherenceStatus.isValid 
                ? 'Cohérent' 
                : `${coherenceStatus.issuesCount} erreur${coherenceStatus.issuesCount > 1 ? 's' : ''}`
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
