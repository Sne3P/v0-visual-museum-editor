/**
 * RENDU DES PORTES SÉLECTIONNÉES
 * Affiche les handles de manipulation et la preview
 */

import type { Point, Door } from '@/core/entities'
import { COLORS, GRID_SIZE } from '@/core/constants'
import { worldToCanvas } from '@/core/utils'

/**
 * Dessine une porte sélectionnée avec ses handles
 */
export function drawSelectedDoor(
  ctx: CanvasRenderingContext2D,
  door: Door,
  zoom: number,
  pan: Point,
  editMode: 'move' | 'resize-start' | 'resize-end' | null
) {
  // Convertir coordonnées pixels -> canvas
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

  const midX = (startCanvas.x + endCanvas.x) / 2
  const midY = (startCanvas.y + endCanvas.y) / 2

  // Ligne de la porte avec highlight
  ctx.beginPath()
  ctx.moveTo(startCanvas.x, startCanvas.y)
  ctx.lineTo(endCanvas.x, endCanvas.y)
  ctx.strokeStyle = COLORS.doorSelected
  ctx.lineWidth = 12 * zoom
  ctx.lineCap = "round"
  ctx.stroke()

  // Ligne blanche décorative
  ctx.strokeStyle = "white"
  ctx.lineWidth = 6 * zoom
  ctx.stroke()

  // Handles aux extrémités
  const handleRadius = 12 * zoom
  
  // Handle start
  ctx.beginPath()
  ctx.arc(startCanvas.x, startCanvas.y, handleRadius, 0, Math.PI * 2)
  ctx.fillStyle = editMode === 'resize-start' ? COLORS.doorSelected : "white"
  ctx.fill()
  ctx.strokeStyle = COLORS.doorSelected
  ctx.lineWidth = 3
  ctx.stroke()

  // Handle end
  ctx.beginPath()
  ctx.arc(endCanvas.x, endCanvas.y, handleRadius, 0, Math.PI * 2)
  ctx.fillStyle = editMode === 'resize-end' ? COLORS.doorSelected : "white"
  ctx.fill()
  ctx.strokeStyle = COLORS.doorSelected
  ctx.lineWidth = 3
  ctx.stroke()

  // Handle central (pour move)
  const centerRadius = 10 * zoom
  ctx.beginPath()
  ctx.arc(midX, midY, centerRadius, 0, Math.PI * 2)
  ctx.fillStyle = editMode === 'move' ? COLORS.doorSelected : "rgba(139, 92, 246, 0.5)"
  ctx.fill()
  ctx.strokeStyle = "white"
  ctx.lineWidth = 2
  ctx.stroke()

  // Badge "P"
  const fontSize = Math.max(10, 12 * zoom)
  ctx.font = `bold ${fontSize}px system-ui`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "white"
  ctx.fillText("P", midX, midY)

  // Afficher largeur
  const widthText = `${door.width.toFixed(2)}m`
  const widthFontSize = Math.max(8, 10 * zoom)
  ctx.font = `${widthFontSize}px system-ui`
  
  const widthTextWidth = ctx.measureText(widthText).width
  const widthPadding = 4 * zoom
  const widthY = midY + fontSize + 8 * zoom
  
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
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
 * Dessine la preview d'une porte pendant manipulation
 */
export function drawDoorManipulationPreview(
  ctx: CanvasRenderingContext2D,
  door: Door,
  zoom: number,
  pan: Point,
  isValid: boolean
) {
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

  // Ligne preview (semi-transparente)
  ctx.beginPath()
  ctx.moveTo(startCanvas.x, startCanvas.y)
  ctx.lineTo(endCanvas.x, endCanvas.y)
  ctx.strokeStyle = color
  ctx.lineWidth = 10 * zoom
  ctx.lineCap = "round"
  ctx.globalAlpha = 0.7
  ctx.stroke()
  ctx.globalAlpha = 1.0

  // Points
  const radius = 10 * zoom
  
  ctx.fillStyle = color
  ctx.strokeStyle = "white"
  ctx.lineWidth = 2
  
  ctx.beginPath()
  ctx.arc(startCanvas.x, startCanvas.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(endCanvas.x, endCanvas.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Badge P
  const fontSize = Math.max(10, 12 * zoom)
  ctx.font = `bold ${fontSize}px system-ui`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  
  const text = "P"
  const textWidth = ctx.measureText(text).width
  const padding = 6 * zoom
  
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
  
  ctx.fillStyle = "white"
  ctx.fillText(text, midX, midY)
}

/**
 * Dessine un curseur custom pour les handles
 */
export function drawHandleCursor(
  ctx: CanvasRenderingContext2D,
  point: Point,
  mode: 'move' | 'resize',
  zoom: number
) {
  const radius = 8 * zoom
  
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = mode === 'resize' ? "rgba(59, 130, 246, 0.3)" : "rgba(139, 92, 246, 0.3)"
  ctx.fill()
  ctx.strokeStyle = mode === 'resize' ? "rgb(59, 130, 246)" : "rgb(139, 92, 246)"
  ctx.lineWidth = 2
  ctx.stroke()
}
