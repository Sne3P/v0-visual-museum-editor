/**
 * RENDU DE LA PREVIEW DE CRÉATION DE PORTE
 */

import type { Point, Door } from '@/core/entities'
import type { SharedWallSegment, DoorPosition } from '@/core/services'
import { COLORS, GRID_SIZE } from '@/core/constants'
import { worldToCanvas } from '@/core/utils'

/**
 * Dessine les murs partagés (segments où on peut placer des portes)
 */
export function drawSharedWalls(
  ctx: CanvasRenderingContext2D,
  sharedWalls: SharedWallSegment[],
  zoom: number,
  pan: Point,
  hoveredWall: SharedWallSegment | null = null
) {
  for (const wall of sharedWalls) {
    const [start, end] = wall.segment
    const startCanvas = worldToCanvas(start, zoom, pan)
    const endCanvas = worldToCanvas(end, zoom, pan)

    const isHovered = hoveredWall?.segment === wall.segment

    // Ligne en pointillés pour indiquer qu'on peut placer une porte
    ctx.beginPath()
    ctx.moveTo(startCanvas.x, startCanvas.y)
    ctx.lineTo(endCanvas.x, endCanvas.y)
    
    ctx.strokeStyle = isHovered ? COLORS.doorHovered : 'rgba(139, 92, 246, 0.4)'
    ctx.lineWidth = (isHovered ? 6 : 4) * zoom
    ctx.setLineDash([10 * zoom, 5 * zoom])
    ctx.lineCap = "round"
    ctx.stroke()
    ctx.setLineDash([]) // Reset

    // Points aux extrémités
    const pointRadius = 6 * zoom
    
    ctx.beginPath()
    ctx.arc(startCanvas.x, startCanvas.y, pointRadius, 0, Math.PI * 2)
    ctx.fillStyle = isHovered ? COLORS.doorHovered : 'rgba(139, 92, 246, 0.6)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(endCanvas.x, endCanvas.y, pointRadius, 0, Math.PI * 2)
    ctx.fillStyle = isHovered ? COLORS.doorHovered : 'rgba(139, 92, 246, 0.6)'
    ctx.fill()
  }
}

/**
 * Dessine les positions suggérées pour les portes
 */
export function drawDoorPositions(
  ctx: CanvasRenderingContext2D,
  positions: DoorPosition[],
  zoom: number,
  pan: Point,
  hoveredPosition: DoorPosition | null = null
) {
  for (const pos of positions) {
    const centerCanvas = worldToCanvas(pos.center, zoom, pan)
    const isHovered = hoveredPosition?.center === pos.center

    // Cercle au centre
    const radius = (isHovered ? 12 : 8) * zoom
    
    ctx.beginPath()
    ctx.arc(centerCanvas.x, centerCanvas.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = isHovered 
      ? 'rgba(139, 92, 246, 0.8)' 
      : 'rgba(139, 92, 246, 0.4)'
    ctx.fill()
    
    ctx.strokeStyle = COLORS.doorDefault
    ctx.lineWidth = 2 * zoom
    ctx.stroke()

    // Icône "+"
    if (isHovered) {
      const iconSize = 8 * zoom
      ctx.beginPath()
      ctx.moveTo(centerCanvas.x - iconSize, centerCanvas.y)
      ctx.lineTo(centerCanvas.x + iconSize, centerCanvas.y)
      ctx.moveTo(centerCanvas.x, centerCanvas.y - iconSize)
      ctx.lineTo(centerCanvas.x, centerCanvas.y + iconSize)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2 * zoom
      ctx.stroke()
    }
  }
}

/**
 * Dessine la preview de la porte en cours de création
 * @param door - Porte avec segment en unités de grille (à multiplier par GRID_SIZE)
 * @param isValid - Si la porte est valide pour le placement
 */
export function drawDoorPreview(
  ctx: CanvasRenderingContext2D,
  door: Door,
  zoom: number,
  pan: Point,
  gridSize: number = GRID_SIZE,
  isValid: boolean = false
) {
  // Convertir coordonnées pixels -> canvas (door.segment déjà en pixels)
  const startCanvas = worldToCanvas(
    { x: door.segment[0].x, y: door.segment[0].y },
    zoom,
    pan
  )
  const endCanvas = worldToCanvas(
    { x: door.segment[1].x, y: door.segment[1].y },
    zoom,
    pan
  )

  const color = isValid ? COLORS.doorSelected : COLORS.doorInvalid
  const midX = (startCanvas.x + endCanvas.x) / 2
  const midY = (startCanvas.y + endCanvas.y) / 2

  // Ligne de base
  ctx.beginPath()
  ctx.moveTo(startCanvas.x, startCanvas.y)
  ctx.lineTo(endCanvas.x, endCanvas.y)
  ctx.strokeStyle = color
  ctx.lineWidth = 10 * zoom
  ctx.lineCap = "round"
  ctx.stroke()

  // Ligne décorative blanche
  ctx.strokeStyle = "white"
  ctx.lineWidth = 5 * zoom
  ctx.stroke()

  // Points aux extrémités
  const radius = 12 * zoom
  
  ctx.fillStyle = color
  ctx.strokeStyle = "white"
  ctx.lineWidth = 3
  
  ctx.beginPath()
  ctx.arc(startCanvas.x, startCanvas.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(endCanvas.x, endCanvas.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Badge "P" au centre
  const fontSize = Math.max(10, 12 * zoom)
  ctx.font = `bold ${fontSize}px system-ui`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  
  const text = "P"
  const textWidth = ctx.measureText(text).width
  const padding = 6 * zoom
  
  // Badge background
  ctx.fillStyle = isValid ? "rgba(34, 197, 94, 0.9)" : "rgba(239, 68, 68, 0.9)"
  ctx.beginPath()
  ctx.roundRect(
    midX - textWidth/2 - padding,
    midY - fontSize/2 - padding/2,
    textWidth + padding*2,
    fontSize + padding,
    3 * zoom
  )
  ctx.fill()
  ctx.strokeStyle = "white"
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Badge text
  ctx.fillStyle = "white"
  ctx.fillText(text, midX, midY)

  // Largeur en dessous
  const widthText = `${door.width.toFixed(2)}m`
  const widthFontSize = Math.max(8, 10 * zoom)
  ctx.font = `${widthFontSize}px system-ui`
  
  const widthTextWidth = ctx.measureText(widthText).width
  const widthPadding = 4 * zoom
  const widthY = midY + fontSize + 5 * zoom
  
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
  ctx.fillRect(
    midX - widthTextWidth/2 - widthPadding,
    widthY,
    widthTextWidth + widthPadding*2,
    widthFontSize + widthPadding
  )
  
  ctx.fillStyle = "white"
  ctx.fillText(widthText, midX, widthY + widthFontSize/2)
}

/**
 * Dessine les guides d'alignement pendant la création
 */
export function drawDoorCreationGuides(
  ctx: CanvasRenderingContext2D,
  selectedWall: SharedWallSegment,
  currentPoint: Point,
  zoom: number,
  pan: Point
) {
  const [start, end] = selectedWall.segment
  const startCanvas = worldToCanvas(start, zoom, pan)
  const endCanvas = worldToCanvas(end, zoom, pan)
  const currentCanvas = worldToCanvas(currentPoint, zoom, pan)

  // Highlight du mur sélectionné
  ctx.beginPath()
  ctx.moveTo(startCanvas.x, startCanvas.y)
  ctx.lineTo(endCanvas.x, endCanvas.y)
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)'
  ctx.lineWidth = 8 * zoom
  ctx.lineCap = "round"
  ctx.stroke()

  // Curseur crosshair au point courant
  const crossSize = 15 * zoom
  
  ctx.strokeStyle = COLORS.doorSelected
  ctx.lineWidth = 2 * zoom
  
  ctx.beginPath()
  ctx.moveTo(currentCanvas.x - crossSize, currentCanvas.y)
  ctx.lineTo(currentCanvas.x + crossSize, currentCanvas.y)
  ctx.moveTo(currentCanvas.x, currentCanvas.y - crossSize)
  ctx.lineTo(currentCanvas.x, currentCanvas.y + crossSize)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(currentCanvas.x, currentCanvas.y, 8 * zoom, 0, Math.PI * 2)
  ctx.stroke()
}
