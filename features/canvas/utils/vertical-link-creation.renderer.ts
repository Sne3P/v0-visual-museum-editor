/**
 * RENDU PREVIEW CRÉATION ESCALIERS/ASCENSEURS
 * Système drag simple pour créer un rectangle
 */

import type { Point } from '@/core/entities'
import { COLORS } from '@/core/constants'
import { worldToCanvas } from '@/core/utils'

/**
 * Dessine la preview d'un rectangle escalier/ascenseur en cours de création
 */
export function drawVerticalLinkPreview(
  ctx: CanvasRenderingContext2D,
  startPoint: Point | null,
  currentPoint: Point | null,
  type: 'stairs' | 'elevator',
  zoom: number,
  pan: Point,
  isValid: boolean
) {
  if (!startPoint || !currentPoint) return

  const color = isValid ? 
    (type === 'stairs' ? COLORS.stairsDefault : COLORS.elevatorDefault) :
    '#ef4444'  // Rouge pour invalide

  // Convertir en coordonnées canvas
  const start = worldToCanvas(startPoint, zoom, pan)
  const current = worldToCanvas(currentPoint, zoom, pan)

  // Calculer rectangle
  const minX = Math.min(start.x, current.x)
  const maxX = Math.max(start.x, current.x)
  const minY = Math.min(start.y, current.y)
  const maxY = Math.max(start.y, current.y)
  const width = maxX - minX
  const height = maxY - minY

  // Remplissage semi-transparent
  ctx.fillStyle = color + '20'
  ctx.fillRect(minX, minY, width, height)

  // Contour
  ctx.strokeStyle = color
  ctx.lineWidth = 2 * zoom
  ctx.setLineDash([5 * zoom, 5 * zoom])
  ctx.strokeRect(minX, minY, width, height)
  ctx.setLineDash([])

  // Icône au centre
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  
  ctx.fillStyle = color
  ctx.font = `${20 * zoom}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(type === 'stairs' ? '↕' : '⬍', centerX, centerY)

  // Points de coin
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ]
  
  corners.forEach(corner => {
    ctx.beginPath()
    ctx.arc(corner.x, corner.y, 5 * zoom, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  })
}
