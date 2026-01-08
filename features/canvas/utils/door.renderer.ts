/**
 * RENDU DES PORTES
 */

import type { Door, Point } from '@/core/entities'
import { COLORS, STROKE_WIDTHS } from '@/core/constants'
import { worldToCanvas } from '@/core/utils'

export function drawDoor(
  ctx: CanvasRenderingContext2D,
  door: Door,
  zoom: number,
  pan: Point,
  gridSize: number = 40,
  isSelected: boolean = false,
  isHovered: boolean = false,
  isInvalid: boolean = false
) {
  const start = worldToCanvas({ x: door.segment[0].x, y: door.segment[0].y }, zoom, pan)
  const end = worldToCanvas({ x: door.segment[1].x, y: door.segment[1].y }, zoom, pan)

  const strokeColor = isInvalid
    ? COLORS.doorInvalid
    : isSelected
    ? COLORS.doorSelected
    : isHovered
    ? COLORS.doorHovered
    : COLORS.doorDefault

  // Ligne de base
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = (isSelected ? 8 : isHovered ? 6 : 4) * zoom
  ctx.lineCap = "round"
  ctx.stroke()

  // Ligne décorative blanche
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = "white"
  ctx.lineWidth = (isSelected ? 4 : isHovered ? 3 : 2) * zoom
  ctx.lineCap = "round"
  ctx.stroke()

  // Endpoints
  const endpointRadius = 10 * zoom

  // Point de début
  ctx.beginPath()
  ctx.arc(start.x, start.y, endpointRadius, 0, Math.PI * 2)
  ctx.fillStyle = strokeColor
  ctx.fill()
  ctx.strokeStyle = "white"
  ctx.lineWidth = 3
  ctx.stroke()

  // Point de fin
  ctx.beginPath()
  ctx.arc(end.x, end.y, endpointRadius, 0, Math.PI * 2)
  ctx.fillStyle = strokeColor
  ctx.fill()
  ctx.strokeStyle = "white"
  ctx.lineWidth = 3
  ctx.stroke()

  // Label "P" au centre
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  
  const fontSize = Math.max(8, 10 * zoom)
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  
  const text = "P"
  const textWidth = ctx.measureText(text).width
  const padding = 4 * zoom
  
  // Rectangle de fond
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
  ctx.beginPath()
  ctx.roundRect(
    midX - textWidth/2 - padding,
    midY - fontSize/2 - padding/2,
    textWidth + padding*2,
    fontSize + padding,
    2 * zoom
  )
  ctx.fill()
  
  // Contour
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = 1
  ctx.stroke()
  
  // Texte
  ctx.fillStyle = strokeColor
  ctx.fillText(text, midX, midY)
}

export function drawDoorEndpoints(
  ctx: CanvasRenderingContext2D,
  door: Door,
  zoom: number,
  pan: Point,
  gridSize: number = 40,
  hoveredEndpoint?: "start" | "end"
) {
  const start = worldToCanvas({ x: door.segment[0].x, y: door.segment[0].y }, zoom, pan)
  const end = worldToCanvas({ x: door.segment[1].x, y: door.segment[1].y }, zoom, pan)

  const endpointRadius = 10 * zoom
  const strokeColor = COLORS.doorDefault

  if (hoveredEndpoint === "start") {
    ctx.beginPath()
    ctx.arc(start.x, start.y, endpointRadius * 1.3, 0, Math.PI * 2)
    ctx.shadowColor = strokeColor
    ctx.shadowBlur = 20
    ctx.fillStyle = strokeColor
    ctx.fill()
    ctx.shadowBlur = 0
  }

  if (hoveredEndpoint === "end") {
    ctx.beginPath()
    ctx.arc(end.x, end.y, endpointRadius * 1.3, 0, Math.PI * 2)
    ctx.shadowColor = strokeColor
    ctx.shadowBlur = 20
    ctx.fillStyle = strokeColor
    ctx.fill()
    ctx.shadowBlur = 0
  }
}
