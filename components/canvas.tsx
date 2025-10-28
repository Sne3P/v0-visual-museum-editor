"use client"

import type React from "react"
import { useRef, useCallback, useState, useEffect } from "react"
import type { EditorState, Floor, Point, Room, Artwork, Door, VerticalLink, HoverInfo, DragInfo } from "@/lib/types"
import {
  snapToGrid,
  isPointInPolygon,
  snapToWallSegmentWithPosition,
  polygonsIntersect,
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
} from "@/lib/geometry"
import { 
  GRID_SIZE, 
  MAJOR_GRID_INTERVAL, 
  COLORS, 
  STROKE_WIDTHS, 
  VERTEX_RADIUS, 
  ENDPOINT_RADIUS,
  VERTEX_HIT_RADIUS,
  ENDPOINT_HIT_RADIUS,
  LINE_HIT_THRESHOLD 
} from "@/lib/constants"
import { useRenderOptimization, useThrottle } from "@/lib/hooks"
import { useKeyboardShortcuts, getInteractionCursor, calculateSmoothZoom } from "@/lib/interactions"
import { validateRoom, validateArtwork, validateDoor, validateVerticalLink } from "@/lib/validation"
import { ContextMenu } from "./context-menu"

interface CanvasProps {
  state: EditorState
  updateState: (updates: Partial<EditorState>) => void
  currentFloor: Floor
  onNavigateToFloor?: (floorId: string) => void
  onRecenter?: () => void
}

export function Canvas({ state, updateState, currentFloor, onNavigateToFloor }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null)
  const [isValidPlacement, setIsValidPlacement] = useState(true)
  const [drawStartPoint, setDrawStartPoint] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [selectionBox, setSelectionBox] = useState<{
    start: Point
    end: Point
  } | null>(null)

  const [dragStartState, setDragStartState] = useState<{
    type: "vertex" | "room" | "door" | "verticalLink" | "artwork" // Added artwork
    originalData: any
  } | null>(null)

  const [draggedVertex, setDraggedVertex] = useState<{ roomId: string; vertexIndex: number } | null>(null)
  const [draggedRoom, setDraggedRoom] = useState<{ roomId: string; startPos: Point; roomStartPos: Point } | null>(null)
  const [draggedElement, setDraggedElement] = useState<{
    type: "door" | "verticalLink"
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
    type: "room" | "door" | "verticalLink" | "artwork" | "vertex" | "doorEndpoint" | "linkEndpoint" // Added artwork endpoint types
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
    type: "background" | "room" | "door" | "verticalLink" | "artwork" // Added artwork
    elementId?: string
  } | null>(null)

  const [multiSelectMode, setMultiSelectMode] = useState(false)

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

  const drawRoom = useCallback(
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
          ? "rgba(239, 68, 68, 0.15)"
          : isSelected
            ? "rgba(59, 130, 246, 0.15)"
            : isHovered
              ? "rgba(59, 130, 246, 0.08)"
              : "rgba(245, 245, 245, 0.9)"

      ctx.fillStyle = fillColor
      ctx.fill()

      const strokeColor =
        isDraggingThis && !isValidPlacement
          ? "rgb(239, 68, 68)"
          : isSelected
            ? "rgb(59, 130, 246)"
            : isHovered
              ? "rgb(96, 165, 250)"
              : "rgb(115, 115, 115)"

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5
      ctx.stroke()

      if (state.selectedTool === "select" || isSelected) {
        room.polygon.forEach((point, index) => {
          const screenPoint = worldToScreen(point.x * GRID_SIZE, point.y * GRID_SIZE)
          const isVertexHovered =
            hoveredElement?.type === "vertex" && hoveredElement.id === room.id && hoveredElement.vertexIndex === index

          const vertexRadius = (isVertexHovered ? 8 : isSelected ? 5 : 4) * state.zoom

          ctx.beginPath()
          ctx.arc(screenPoint.x, screenPoint.y, vertexRadius, 0, Math.PI * 2)

          if (isVertexHovered) {
            ctx.shadowColor = "rgb(34, 197, 94)"
            ctx.shadowBlur = 10 * state.zoom
          }

          ctx.fillStyle = isVertexHovered ? "rgb(34, 197, 94)" : isSelected ? "rgb(59, 130, 246)" : "rgb(115, 115, 115)"
          ctx.fill()

          ctx.shadowBlur = 0

          ctx.strokeStyle = "white"
          ctx.lineWidth = 1.5
          ctx.stroke()

          if (isVertexHovered) {
            ctx.beginPath()
            ctx.arc(screenPoint.x, screenPoint.y, vertexRadius + 2 * state.zoom, 0, Math.PI * 2)
            ctx.strokeStyle = "rgb(34, 197, 94)"
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
        })
      }
    },
    [worldToScreen, hoveredElement, draggedRoom, draggedVertex, isValidPlacement, state.selectedTool],
  )

  const drawArtwork = useCallback(
    (ctx: CanvasRenderingContext2D, artwork: Artwork, isSelected: boolean, isHovered: boolean) => {
      const size = artwork.size || [1, 1]
      const topLeft = worldToScreen(artwork.xy[0] * GRID_SIZE, artwork.xy[1] * GRID_SIZE)
      const width = size[0] * GRID_SIZE * state.zoom
      const height = size[1] * GRID_SIZE * state.zoom

      const isDraggingThis = draggedArtwork?.artworkId === artwork.id || resizingArtwork?.artworkId === artwork.id

      ctx.fillStyle =
        isDraggingThis && !isValidPlacement
          ? "rgba(239, 68, 68, 0.3)"
          : isSelected
            ? "rgba(59, 130, 246, 0.3)"
            : isHovered
              ? "rgba(59, 130, 246, 0.2)"
              : "rgba(219, 234, 254, 0.8)"
      ctx.fillRect(topLeft.x, topLeft.y, width, height)

      ctx.strokeStyle =
        isDraggingThis && !isValidPlacement
          ? "rgb(239, 68, 68)"
          : isSelected
            ? "rgb(59, 130, 246)"
            : isHovered
              ? "rgb(96, 165, 250)"
              : "rgb(59, 130, 246)"
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
          ctx.strokeStyle = "rgb(59, 130, 246)"
          ctx.lineWidth = 2
          ctx.stroke()
        })
      }

      ctx.fillStyle = "rgb(59, 130, 246)"
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

  const validatePlacement = useCallback(
    (tool: string, point: Point, startPoint?: Point) => {
      if (tool === "room" && state.currentPolygon.length > 0) {
        const firstPoint = state.currentPolygon[0]
        const distance = Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y)
        if (distance < 0.3 && state.currentPolygon.length >= 3) {
          setIsValidPlacement(true)
          return
        }
        setIsValidPlacement(true)
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

          const overlaps = rectangleOverlapsRooms(testPolygon, currentFloor.rooms)
          setIsValidPlacement(!overlaps)
        }
      } else if (tool === "artwork") {
        if (startPoint && point) {
          const minX = Math.min(startPoint.x, point.x)
          const minY = Math.min(startPoint.y, point.y)
          const maxX = Math.max(startPoint.x, point.x)
          const maxY = Math.max(startPoint.y, point.y)

          const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ]

          const allInRoom = corners.every((corner) =>
            currentFloor.rooms.some((room) => isPointInPolygon(corner, room.polygon)),
          )
          setIsValidPlacement(allInRoom)
        }
      } else if (tool === "door" || tool === "stairs" || tool === "elevator") {
        if (startPoint && point && wallSegmentSnap) {
          const segment = calculateWallSegment(
            startPoint,
            point,
            wallSegmentSnap.segmentStart,
            wallSegmentSnap.segmentEnd,
          )
          const occupied = isWallSegmentOccupied(
            segment.start,
            segment.end,
            currentFloor.doors,
            currentFloor.verticalLinks,
            currentFloor.artworks,
          )
          setIsValidPlacement(!occupied)
          setCreationPreview({ start: segment.start, end: segment.end, valid: !occupied })
        } else {
          setIsValidPlacement(wallSegmentSnap !== null)
          setCreationPreview(null)
        }
      }
    },
    [state.currentPolygon, currentFloor, wallSegmentSnap],
  )

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { width, height } = canvas

    ctx.clearRect(0, 0, width, height)

    drawGrid(ctx, width, height)

    currentFloor.rooms.forEach((room) => {
      const isSelected = state.selectedElementId === room.id && state.selectedElementType === "room"
      const isHovered = hoveredElement?.type === "room" && hoveredElement.id === room.id
      drawRoom(ctx, room, isSelected, isHovered)
    })

    if (isDragging && drawStartPoint && hoveredPoint) {
      ctx.beginPath()

      if (state.selectedTool === "rectangle") {
        const topLeft = worldToScreen(drawStartPoint.x * GRID_SIZE, drawStartPoint.y * GRID_SIZE)
        const bottomRight = worldToScreen(hoveredPoint.x * GRID_SIZE, hoveredPoint.y * GRID_SIZE)
        const width = bottomRight.x - topLeft.x
        const height = bottomRight.y - topLeft.y
        ctx.rect(topLeft.x, topLeft.y, width, height)
      } else if (state.selectedTool === "circle") {
        const center = worldToScreen(drawStartPoint.x * GRID_SIZE, drawStartPoint.y * GRID_SIZE)
        const radius =
          Math.max(Math.abs(hoveredPoint.x - drawStartPoint.x), Math.abs(hoveredPoint.y - drawStartPoint.y)) *
          GRID_SIZE *
          state.zoom
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

      ctx.fillStyle = isValidPlacement ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"
      ctx.fill()
      ctx.strokeStyle = isValidPlacement ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
      ctx.lineWidth = 2
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

        if (distanceToFirst < 0.3 && state.currentPolygon.length >= 3) {
          ctx.lineTo(firstPoint.x, firstPoint.y)
          ctx.closePath()
          isClosing = true

          // Remplissage du polygone en cours de finalisation
          ctx.fillStyle = isValidPlacement ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"
          ctx.fill()

          // Indicateur de fermeture plus petit
          ctx.beginPath()
          ctx.arc(firstPoint.x, firstPoint.y, 6 * state.zoom, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(34, 197, 94, 0.4)"
          ctx.fill()
          ctx.strokeStyle = "rgb(34, 197, 94)"
          ctx.lineWidth = 2
          ctx.stroke()
        } else {
          ctx.lineTo(hoverScreen.x, hoverScreen.y)
        }
      }

      // Contour du polygone
      ctx.strokeStyle = isValidPlacement ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
      ctx.lineWidth = 2
      ctx.stroke()

      // Si le polygone est fermé, ajouter un remplissage léger
      if (isClosing) {
        ctx.fillStyle = isValidPlacement ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)"
        ctx.fill()
      }

      // Points du polygone plus petits
      state.currentPolygon.forEach((point) => {
        const screenPoint = worldToScreen(point.x * GRID_SIZE, point.y * GRID_SIZE)
        ctx.beginPath()
        ctx.arc(screenPoint.x, screenPoint.y, 3 * state.zoom, 0, Math.PI * 2)
        ctx.fillStyle = "rgb(34, 197, 94)"
        ctx.fill()
        ctx.strokeStyle = "white"
        ctx.lineWidth = 1
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
      ctx.strokeStyle = creationPreview.valid ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)"
      ctx.lineWidth = 8 * state.zoom
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(start.x, start.y, 4 * state.zoom, 0, Math.PI * 2)
      ctx.arc(end.x, end.y, 4 * state.zoom, 0, Math.PI * 2)
      ctx.fillStyle = creationPreview.valid ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
      ctx.fill()
    }

    currentFloor.artworks.forEach((artwork) => {
      const isSelected = state.selectedElementId === artwork.id && state.selectedElementType === "artwork"
      const isHovered = hoveredElement?.type === "artwork" && hoveredElement.id === artwork.id
      drawArtwork(ctx, artwork, isSelected, isHovered)
    })

    currentFloor.doors.forEach((door) => {
      const isSelected = state.selectedElementId === door.id && state.selectedElementType === "door"
      const isHovered = hoveredElement?.type === "door" && hoveredElement.id === door.id
      drawDoor(ctx, door, isSelected, isHovered)
    })

    currentFloor.verticalLinks.forEach((link) => {
      const isSelected = state.selectedElementId === link.id && state.selectedElementType === "verticalLink"
      const isHovered = hoveredElement?.type === "verticalLink" && hoveredElement.id === link.id
      drawVerticalLink(ctx, link, isSelected, isHovered)
    })

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
      ctx.fillStyle = isValidPlacement ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)"
      ctx.fill()
      ctx.strokeStyle = isValidPlacement ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
      ctx.lineWidth = 2
      ctx.stroke()
    }
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
    drawRoom,
    drawArtwork,
    drawDoor,
    drawVerticalLink,
    worldToScreen,
    draggedRoom,
    draggedElement,
    draggedArtwork, // Add to dependencies
    resizingArtwork, // Add to dependencies
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

          const overlaps = currentFloor.rooms.some((r) => r.id !== room.id && polygonsIntersect(newPolygon, r.polygon))
          setIsValidPlacement(!overlaps)

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

            return {
              ...floor,
              rooms: floor.rooms.map((r) => {
                if (r.id !== draggedRoom.roomId) return r
                return { ...r, polygon: newPolygon }
              }),
              doors: updatedDoors,
              verticalLinks: updatedLinks,
              artworks: updatedArtworks,
            }
          })

          updateState({ floors: newFloors })
          setDraggedRoom({ ...draggedRoom, startPos: gridPos })
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

          updateState({ floors: newFloors })
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

        updateState({ floors: newFloors })
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

                const newSegment: [Point, Point] =
                  draggedElement.endpoint === "start" ? [gridPos, door.segment[1]] : [door.segment[0], gridPos]

                const width = Math.hypot(newSegment[1].x - newSegment[0].x, newSegment[1].y - newSegment[0].y)

                const occupied = isWallSegmentOccupied(
                  newSegment[0],
                  newSegment[1],
                  floor.doors.filter((d) => d.id !== door.id),
                  floor.verticalLinks,
                  floor.artworks,
                )
                setIsValidPlacement(!occupied)

                return { ...door, segment: newSegment, width }
              }),
            }
          } else {
            return {
              ...floor,
              verticalLinks: floor.verticalLinks.map((link) => {
                if (link.id !== draggedElement.id) return link

                const newSegment: [Point, Point] =
                  draggedElement.endpoint === "start" ? [gridPos, link.segment[1]] : [link.segment[0], gridPos]

                const width = Math.hypot(newSegment[1].x - newSegment[0].x, newSegment[1].y - newSegment[0].y)

                const occupied = isWallSegmentOccupied(
                  newSegment[0],
                  newSegment[1],
                  floor.doors,
                  floor.verticalLinks.filter((l) => l.id !== link.id),
                  floor.artworks,
                )
                setIsValidPlacement(!occupied)

                return { ...link, segment: newSegment, width }
              }),
            }
          }
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

        const overlaps = currentFloor.rooms.some((r) => r.id !== room.id && polygonsIntersect(newPolygon, r.polygon))
        setIsValidPlacement(!overlaps)

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

          return {
            ...floor,
            rooms: floor.rooms.map((r) => {
              if (r.id !== draggedVertex.roomId) return r
              return { ...r, polygon: newPolygon }
            }),
            doors: updatedDoors,
            verticalLinks: updatedLinks,
          }
        })

        updateState({ floors: newFloors })
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

        // Priority 6: Check rooms (body)
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

        if (hoveredElement?.type === "room") {
          const room = currentFloor.rooms.find((r) => r.id === hoveredElement.id)
          if (room) {
            setDragStartState({ type: "room", originalData: { ...room } })
            setDraggedRoom({
              roomId: room.id,
              startPos: gridPos,
              roomStartPos: room.polygon[0],
            })
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

          if (distance < 0.3) {
            const newRoom: Room = {
              id: `room-${Date.now()}`,
              polygon: state.currentPolygon,
            }

            const newFloors = state.floors.map((floor) =>
              floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, newRoom] } : floor,
            )

            updateState({
              floors: newFloors,
              currentPolygon: [],
            })
            return
          }
        }

        updateState({
          currentPolygon: [...state.currentPolygon, gridPos],
        })
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
          type: "room" | "artwork" | "door" | "verticalLink" | "vertex"
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

        updateState({ selectedElements })
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
          updateState({ floors: newFloors })
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
          updateState({ floors: newFloors })
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
          updateState({ floors: newFloors })
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
          updateState({ floors: newFloors })
        }
        setDraggedRoom(null)
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
            }
            return floor
          })
          updateState({ floors: newFloors })
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

      if (state.selectedTool === "rectangle") {
        const newRoom: Room = {
          id: `room-${Date.now()}`,
          polygon: [
            drawStartPoint,
            { x: gridPos.x, y: drawStartPoint.y },
            gridPos,
            { x: drawStartPoint.x, y: gridPos.y },
          ],
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, newRoom] } : floor,
        )

        updateState({ floors: newFloors })
      } else if (state.selectedTool === "circle") {
        const radius = Math.max(Math.abs(gridPos.x - drawStartPoint.x), Math.abs(gridPos.y - drawStartPoint.y))
        const polygon = createCirclePolygon(drawStartPoint, radius)

        const newRoom: Room = {
          id: `room-${Date.now()}`,
          polygon,
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, newRoom] } : floor,
        )

        updateState({ floors: newFloors })
      } else if (state.selectedTool === "triangle") {
        const polygon = createTrianglePolygon(drawStartPoint, gridPos)

        const newRoom: Room = {
          id: `room-${Date.now()}`,
          polygon,
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, newRoom] } : floor,
        )

        updateState({ floors: newFloors })
      } else if (state.selectedTool === "arc") {
        const polygon = createArcPolygon(drawStartPoint, gridPos)

        const newRoom: Room = {
          id: `room-${Date.now()}`,
          polygon,
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, rooms: [...floor.rooms, newRoom] } : floor,
        )

        updateState({ floors: newFloors })
      } else if (state.selectedTool === "artwork") {
        const minX = Math.min(drawStartPoint.x, gridPos.x)
        const minY = Math.min(drawStartPoint.y, gridPos.y)
        const width = Math.abs(gridPos.x - drawStartPoint.x)
        const height = Math.abs(gridPos.y - drawStartPoint.y)

        const newArtwork: Artwork = {
          id: `artwork-${Date.now()}`,
          xy: [minX, minY],
          size: [width, height],
          name: "New Artwork",
          pdf_id: "",
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, artworks: [...floor.artworks, newArtwork] } : floor,
        )

        updateState({ floors: newFloors })
      } else if (state.selectedTool === "door" && wallSegmentSnap && creationPreview) {
        const newDoor: Door = {
          id: `door-${Date.now()}`,
          room_a: "",
          room_b: "",
          segment: [creationPreview.start, creationPreview.end],
          width: Math.hypot(
            creationPreview.end.x - creationPreview.start.x,
            creationPreview.end.y - creationPreview.start.y,
          ),
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, doors: [...floor.doors, newDoor] } : floor,
        )

        updateState({ floors: newFloors })
      } else if (
        (state.selectedTool === "stairs" || state.selectedTool === "elevator") &&
        wallSegmentSnap &&
        creationPreview
      ) {
        const newLink: VerticalLink = {
          id: `${state.selectedTool}-${Date.now()}`,
          type: state.selectedTool,
          segment: [creationPreview.start, creationPreview.end],
          width: Math.hypot(
            creationPreview.end.x - creationPreview.start.x,
            creationPreview.end.y - creationPreview.start.y,
          ),
          direction: "both",
          to_floor: "",
        }

        const newFloors = state.floors.map((floor) =>
          floor.id === state.currentFloorId ? { ...floor, verticalLinks: [...floor.verticalLinks, newLink] } : floor,
        )

        updateState({ floors: newFloors })
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
      }
    },
    [hoveredElement, currentFloor, onNavigateToFloor],
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
    <div ref={containerRef} className="relative h-full w-full">
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
          currentFloor={currentFloor}
          onNavigateToFloor={onNavigateToFloor}
        />
      )}
    </div>
  )
}
