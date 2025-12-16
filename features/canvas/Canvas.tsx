/**
 * CANVAS REFACTORISÉ - Architecture modulaire professionnelle
 * Utilise les hooks et renderers centralisés pour un code maintenable
 */

"use client"

import { useRef, useCallback, useEffect, useState, type MouseEvent } from "react"
import type { EditorState, Floor, Point } from "@/core/entities"
import { 
  drawGrid,
  drawRoom,
  drawWall,
  drawArtwork,
  drawDoor,
  drawVerticalLink,
  drawShapePreview,
  drawSnapPoint,
  drawValidationMessage
} from "@/features/canvas/utils"
import { GRID_SIZE } from "@/core/constants"
import { smartSnap } from "@/core/services"
import { useShapeCreation } from "@/features/canvas/hooks"
import { v4 as uuidv4 } from "uuid"
import { ValidationBadge } from "./components/ValidationBadge"

interface CanvasProps {
  state: EditorState
  updateState: (updates: Partial<EditorState>, saveHistory?: boolean, description?: string) => void
  currentFloor: Floor
  onArtworkDoubleClick?: (artworkId: string) => void
}

export function Canvas({ 
  state, 
  updateState,
  currentFloor,
  onArtworkDoubleClick 
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number>(0)
  
  // États pour l'interaction
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState<Point | null>(null)
  
  // Hook de création de formes
  const shapeCreation = useShapeCreation({
    tool: state.selectedTool,
    currentFloor,
    onComplete: (polygon: Point[]) => {
      // Créer la room selon l'outil
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

  // Conversion coordonnées
  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (screenX - rect.left - state.pan.x) / state.zoom,
      y: (screenY - rect.top - state.pan.y) / state.zoom
    }
  }, [state.pan, state.zoom])

  // Gestion du zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const worldBeforeX = (mouseX - state.pan.x) / state.zoom
    const worldBeforeY = (mouseY - state.pan.y) / state.zoom
    
    const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87
    const newZoom = Math.max(0.1, Math.min(10, state.zoom * zoomDelta))
    
    const newPanX = mouseX - worldBeforeX * newZoom
    const newPanY = mouseY - worldBeforeY * newZoom
    
    updateState({
      zoom: newZoom,
      pan: { x: newPanX, y: newPanY }
    }, false)
  }, [state.zoom, state.pan, updateState])

  // Mouse Down
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snapResult = smartSnap(worldPos, currentFloor)
    
    // Pan avec molette centrale
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      return
    }
    
    // Créer une forme
    if (e.button === 0 && ['rectangle', 'circle', 'triangle', 'arc'].includes(state.selectedTool)) {
      shapeCreation.startCreation(snapResult.point)
    }
  }, [state.selectedTool, screenToWorld, currentFloor, shapeCreation])

  // Mouse Move
  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)
    const snapResult = smartSnap(worldPos, currentFloor)
    
    // Pan
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
    
    // Mettre à jour la prévisualisation pendant la création
    if (shapeCreation.state.isCreating) {
      shapeCreation.updateCreation(snapResult.point)
    }
  }, [isPanning, lastPanPos, state.pan, screenToWorld, currentFloor, updateState, shapeCreation])

  // Mouse Up
  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1) {
      setIsPanning(false)
      setLastPanPos(null)
      return
    }
    
    if (e.button === 0 && shapeCreation.state.isCreating) {
      shapeCreation.finishCreation()
    }
  }, [shapeCreation])

  // Rendu avec animation
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
    currentFloor.rooms.forEach(room => {
      const isSelected = state.selectedElementId === room.id
      drawRoom(ctx, room, state.zoom, state.pan, isSelected, false)
    })

    currentFloor.walls?.forEach(wall => {
      const isSelected = state.selectedElementId === wall.id
      drawWall(ctx, wall, state.zoom, state.pan, isSelected, false)
    })

    currentFloor.doors?.forEach(door => {
      const isSelected = state.selectedElementId === door.id
      drawDoor(ctx, door, state.zoom, state.pan, GRID_SIZE, isSelected, false, false)
    })

    currentFloor.artworks?.forEach(artwork => {
      const isSelected = state.selectedElementId === artwork.id
      drawArtwork(ctx, artwork, state.zoom, state.pan, isSelected, false)
    })

    currentFloor.verticalLinks?.forEach(link => {
      const isSelected = state.selectedElementId === link.id
      drawVerticalLink(ctx, link, state.zoom, state.pan, GRID_SIZE, isSelected, false, false)
    })

    // 3. Prévisualisation de création
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
      
      // Message de validation
      if (shapeCreation.state.validationMessage && !shapeCreation.state.isValid) {
        const canvas = canvasRef.current
        if (canvas) {
          drawValidationMessage(
            ctx,
            shapeCreation.state.validationMessage,
            shapeCreation.state.validationSeverity || 'error',
            { x: canvas.width / 2, y: 50 }
          )
        }
      }
    }

    // 4. Point hover (snap indicator)
    if (hoveredPoint && !shapeCreation.state.isCreating) {
      drawSnapPoint(ctx, hoveredPoint, state.zoom, state.pan, true)
    }

    // Animation continue
    animationFrameRef.current = requestAnimationFrame(render)
  }, [state.zoom, state.pan, state.selectedElementId, currentFloor, shapeCreation.state, hoveredPoint])

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
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    // Démarrer l'animation
    animationFrameRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      canvas.removeEventListener('wheel', handleWheel)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [handleWheel, render])

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-50">
      {/* Badge de validation */}
      <ValidationBadge 
        state={state} 
        currentFloor={currentFloor}
        className="absolute top-4 left-4 z-10"
      />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoveredPoint(null)
          if (shapeCreation.state.isCreating) {
            shapeCreation.cancelCreation()
          }
        }}
        className="w-full h-full cursor-crosshair"
        style={{
          cursor: isPanning ? 'grabbing' : state.selectedTool === 'select' ? 'default' : 'crosshair'
        }}
      />

      {/* Indicateur de l'outil en cours */}
      {state.selectedTool !== 'select' && (
        <div className="absolute bottom-4 left-4 px-3 py-2 bg-gray-900/90 text-white text-sm rounded-lg">
          Mode : {state.selectedTool}
          {shapeCreation.state.isCreating && (
            <span className="ml-2 text-blue-400">• En cours de tracé</span>
          )}
        </div>
      )}
    </div>
  )
}
