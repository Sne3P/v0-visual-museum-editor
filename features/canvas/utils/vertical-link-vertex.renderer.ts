/**
 * RENDERER POUR VERTICES DES VERTICAL LINKS
 * Affiche les 4 coins du rectangle avec feedback hover/selected
 */

import type { Point, VerticalLink, HoverInfo } from '@/core/entities'
import { worldToCanvas } from '@/core/utils'
import { getVerticalLinkCorners } from '@/core/services/vertical-link-vertex.service'

interface VertexRenderOptions {
  isSelected: boolean
  isHovered: boolean
  zoom: number
}

/**
 * Dessiner un vertex de vertical link
 */
function drawVerticalLinkVertex(
  ctx: CanvasRenderingContext2D,
  vertex: Point,
  pan: Point,
  options: VertexRenderOptions
) {
  const screenPos = worldToCanvas(vertex, options.zoom, pan)

  ctx.save()
  ctx.translate(screenPos.x, screenPos.y)

  // Taille selon état
  const baseRadius = 6 // Légèrement plus gros que les vertices de rooms
  const radius = options.isHovered ? baseRadius * 1.5 : baseRadius
  
  // Couleur selon état
  let fillColor = 'rgba(147, 51, 234, 0.7)' // Violet pour vertical links
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

  // Dessiner le vertex (carré pour différencier des rooms)
  ctx.beginPath()
  ctx.rect(-radius, -radius, radius * 2, radius * 2)
  ctx.fillStyle = fillColor
  ctx.fill()
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  ctx.restore()
}

/**
 * Dessiner tous les vertices d'un vertical link
 */
export function drawVerticalLinkVertices(
  ctx: CanvasRenderingContext2D,
  link: VerticalLink,
  pan: Point,
  zoom: number,
  hoverInfo: HoverInfo | null,
  selectedElements: ReadonlyArray<any>
) {
  const corners = getVerticalLinkCorners(link)

  corners.forEach((corner, index) => {
    const isHovered = 
      hoverInfo?.type === 'verticalLinkVertex' &&
      hoverInfo.verticalLinkId === link.id &&
      hoverInfo.vertexIndex === index

    const isSelected = selectedElements.some(
      sel => sel.type === 'verticalLinkVertex' && 
             sel.verticalLinkId === link.id && 
             sel.vertexIndex === index
    )

    drawVerticalLinkVertex(ctx, corner, pan, { isSelected, isHovered, zoom })
  })
}
