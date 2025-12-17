/**
 * RENDU DES VERTICES ET SEGMENTS AVEC FEEDBACK VISUEL
 * Affiche les points et segments sélectionnables avec états hover/selected
 */

import type { Point, Room, HoverInfo } from '@/core/entities'
import { worldToCanvas } from '@/core/utils'

interface VertexRenderOptions {
  isSelected: boolean
  isHovered: boolean
  zoom: number
}

interface SegmentRenderOptions {
  isSelected: boolean
  isHovered: boolean
  zoom: number
}

/**
 * Dessiner un vertex avec feedback visuel
 */
export function drawVertex(
  ctx: CanvasRenderingContext2D,
  vertex: Point,
  pan: Point,
  options: VertexRenderOptions
) {
  const screenPos = worldToCanvas(vertex, options.zoom, pan)

  ctx.save()
  ctx.translate(screenPos.x, screenPos.y)

  // Taille selon état
  const baseRadius = 5
  const radius = options.isHovered ? baseRadius * 1.5 : baseRadius
  
  // Couleur selon état
  let fillColor = 'rgba(59, 130, 246, 0.6)' // Bleu normal
  let strokeColor = '#ffffff'
  let strokeWidth = 2

  if (options.isSelected) {
    fillColor = '#22c55e' // Vert = sélectionné
    strokeColor = '#ffffff'
    strokeWidth = 2.5
  } else if (options.isHovered) {
    fillColor = '#f59e0b' // Orange = hover
    strokeColor = '#ffffff'
    strokeWidth = 3
  }

  // Dessiner le vertex
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = fillColor
  ctx.fill()
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  ctx.restore()
}

/**
 * Dessiner un segment avec feedback visuel
 */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  pan: Point,
  options: SegmentRenderOptions
) {
  const startScreen = worldToCanvas(start, options.zoom, pan)
  const endScreen = worldToCanvas(end, options.zoom, pan)

  // Couleur et épaisseur selon état
  let strokeColor = 'rgba(59, 130, 246, 0.4)' // Bleu transparent normal
  let lineWidth = 3

  if (options.isSelected) {
    strokeColor = '#22c55e' // Vert = sélectionné
    lineWidth = 5
  } else if (options.isHovered) {
    strokeColor = '#f59e0b' // Orange = hover
    lineWidth = 4
  }

  ctx.save()
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(startScreen.x, startScreen.y)
  ctx.lineTo(endScreen.x, endScreen.y)
  ctx.stroke()

  // Dessiner le point central SEULEMENT si selected (pendant le drag)
  if (options.isSelected) {
    const centerScreen = {
      x: (startScreen.x + endScreen.x) / 2,
      y: (startScreen.y + endScreen.y) / 2
    }

    // Indicateur au centre avec icône de déplacement (vert pendant le drag)
    ctx.beginPath()
    ctx.arc(centerScreen.x, centerScreen.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#22c55e'  // Vert = en drag
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Croix centrale (icône déplacement)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(centerScreen.x - 3, centerScreen.y)
    ctx.lineTo(centerScreen.x + 3, centerScreen.y)
    ctx.moveTo(centerScreen.x, centerScreen.y - 3)
    ctx.lineTo(centerScreen.x, centerScreen.y + 3)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Dessiner tous les vertices d'un room avec feedback hover/selected
 */
export function drawRoomVertices(
  ctx: CanvasRenderingContext2D,
  room: Room,
  pan: Point,
  zoom: number,
  hoverInfo: HoverInfo | null,
  selectedElements: ReadonlyArray<any>
) {
  room.polygon.forEach((vertex, index) => {
    const isHovered = 
      hoverInfo?.type === 'vertex' &&
      hoverInfo.roomId === room.id &&
      hoverInfo.vertexIndex === index

    const isSelected = selectedElements.some(
      sel => sel.type === 'vertex' && 
             sel.roomId === room.id && 
             sel.vertexIndex === index
    )

    drawVertex(ctx, vertex, pan, { isSelected, isHovered, zoom })
  })
}

/**
 * Dessiner tous les segments d'un room avec feedback hover/selected
 */
export function drawRoomSegments(
  ctx: CanvasRenderingContext2D,
  room: Room,
  pan: Point,
  zoom: number,
  hoverInfo: HoverInfo | null,
  selectedElements: ReadonlyArray<any>
) {
  for (let i = 0; i < room.polygon.length; i++) {
    const start = room.polygon[i]
    const end = room.polygon[(i + 1) % room.polygon.length]

    const isHovered =
      hoverInfo?.type === 'segment' &&
      hoverInfo.roomId === room.id &&
      hoverInfo.segmentIndex === i

    const isSelected = selectedElements.some(
      sel => sel.type === 'segment' &&
             sel.roomId === room.id &&
             sel.segmentIndex === i
    )

    // Ne dessiner que si hover ou selected pour ne pas surcharger
    if (isHovered || isSelected) {
      drawSegment(ctx, start, end, pan, { isSelected, isHovered, zoom })
    }
  }
}
