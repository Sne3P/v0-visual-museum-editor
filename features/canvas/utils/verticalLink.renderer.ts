/**
 * RENDU DES LIENS VERTICAUX (Escaliers et Ascenseurs)
 * Représentation simple par rectangle (pas de duplication dans autres étages)
 */

import type { VerticalLink, Point } from '@/core/entities'
import { COLORS } from '@/core/constants'
import { worldToCanvas } from '@/core/utils'

export function drawVerticalLink(
  ctx: CanvasRenderingContext2D,
  link: VerticalLink,
  zoom: number,
  pan: Point,
  gridSize: number = 40,
  isSelected: boolean = false,
  isHovered: boolean = false,
  isInvalid: boolean = false,
  currentFloorId?: string
) {
  // Ne pas afficher les liens d'autres étages
  if (currentFloorId && link.floorId !== currentFloorId) {
    return
  }
  
  const isStairs = link.type === "stairs"
  
  const strokeColor = isInvalid
    ? (isStairs ? COLORS.stairsInvalid : COLORS.elevatorInvalid)
    : isSelected
    ? (isStairs ? COLORS.stairsSelected : COLORS.elevatorSelected)
    : isHovered
    ? (isStairs ? COLORS.stairsHovered : COLORS.elevatorHovered)
    : (isStairs ? COLORS.stairsDefault : COLORS.elevatorDefault)

  // Calculer les coins du rectangle
  const halfWidth = link.size[0] / 2
  const halfHeight = link.size[1] / 2
  
  const topLeft = worldToCanvas(
    { x: link.position.x - halfWidth, y: link.position.y - halfHeight },
    zoom,
    pan
  )
  const topRight = worldToCanvas(
    { x: link.position.x + halfWidth, y: link.position.y - halfHeight },
    zoom,
    pan
  )
  const bottomRight = worldToCanvas(
    { x: link.position.x + halfWidth, y: link.position.y + halfHeight },
    zoom,
    pan
  )
  const bottomLeft = worldToCanvas(
    { x: link.position.x - halfWidth, y: link.position.y + halfHeight },
    zoom,
    pan
  )

  drawLinkRectangle(
    ctx,
    [topLeft, topRight, bottomRight, bottomLeft],
    strokeColor,
    isStairs,
    isSelected,
    isHovered,
    isInvalid,
    zoom,
    link.connectedFloorIds.length,
    link.linkNumber
  )
}

/**
 * Dessine un lien vertical (rectangle)
 */
function drawLinkRectangle(
  ctx: CanvasRenderingContext2D,
  corners: Point[],
  strokeColor: string,
  isStairs: boolean,
  isSelected: boolean,
  isHovered: boolean,
  isInvalid: boolean,
  zoom: number,
  connectedFloorsCount: number,
  linkNumber?: number
) {
  // Overlay rouge si invalide
  if (isInvalid) {
    ctx.beginPath()
    ctx.rect(corners[0].x, corners[0].y, corners[1].x - corners[0].x, corners[2].y - corners[0].y)
    ctx.fillStyle = '#fecaca'
    ctx.fill()
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 3 * zoom
    ctx.stroke()
  }

  // Remplissage si sélectionné
  if (isSelected && !isInvalid) {
    ctx.beginPath()
    ctx.rect(corners[0].x, corners[0].y, corners[1].x - corners[0].x, corners[2].y - corners[0].y)
    ctx.fillStyle = strokeColor + '40'  // 40 = ~25% opacity
    ctx.fill()
  }

  // Contour principal
  ctx.beginPath()
  ctx.rect(corners[0].x, corners[0].y, corners[1].x - corners[0].x, corners[2].y - corners[0].y)
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = (isSelected ? 3 : 2) * zoom
  ctx.stroke()

  // Icône au centre
  const centerX = (corners[0].x + corners[2].x) / 2
  const centerY = (corners[0].y + corners[2].y) / 2
  
  ctx.fillStyle = strokeColor
  ctx.font = `${16 * zoom}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(isStairs ? '↕' : '⬍', centerX, centerY)
  
  // Afficher le numéro du lien (Escalier 1, Ascenseur 2, etc.)
  if (linkNumber !== undefined) {
    const label = isStairs ? `Escalier ${linkNumber}` : `Ascenseur ${linkNumber}`
    ctx.font = `bold ${14 * zoom}px Arial`
    ctx.fillText(label, centerX, centerY + 22 * zoom)
  } else if (connectedFloorsCount > 1) {
    // Fallback: afficher le nombre d'étages si pas de numéro
    ctx.font = `${12 * zoom}px Arial`
    ctx.fillText(`${connectedFloorsCount} étages`, centerX, centerY + 20 * zoom)
  }

  // Points de contrôle aux coins (seulement si sélectionné)
  if (isSelected) {
    const pointRadius = 6 * zoom
    corners.forEach(corner => {
      ctx.beginPath()
      ctx.arc(corner.x, corner.y, pointRadius, 0, Math.PI * 2)
      ctx.fillStyle = strokeColor
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 * zoom
      ctx.stroke()
    })
  }
}
