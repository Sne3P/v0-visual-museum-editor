/**
 * RENDU DES ŒUVRES D'ART
 */

import type { Artwork, Point } from '@/core/entities'
import { COLORS, STROKE_WIDTHS, FONTS } from '@/core/constants'
import { worldToCanvas } from '@/core/utils'

export function drawArtwork(
  ctx: CanvasRenderingContext2D,
  artwork: Artwork,
  zoom: number,
  pan: Point,
  isSelected: boolean = false,
  isHovered: boolean = false,
  isDuplicating: boolean = false,
  isValidDuplication: boolean = true
) {
  const [x, y] = artwork.xy
  const pos = worldToCanvas({ x, y }, zoom, pan)
  
  const width = artwork.size ? artwork.size[0] * zoom : 30
  const height = artwork.size ? artwork.size[1] * zoom : 30

  // Rectangle de l'œuvre
  ctx.beginPath()
  ctx.rect(pos.x - width/2, pos.y - height/2, width, height)

  // Couleur selon état (duplication invalide = rouge)
  if (isDuplicating && !isValidDuplication) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)' // Rouge si duplication invalide
  } else if (isSelected || isDuplicating) {
    ctx.fillStyle = COLORS.artworkSelected
  } else if (isHovered) {
    ctx.fillStyle = COLORS.artworkHovered
  } else {
    ctx.fillStyle = COLORS.artworkDefault
  }
  ctx.fill()

  // Contour rouge si invalide
  if (isDuplicating && !isValidDuplication) {
    ctx.strokeStyle = '#EF4444'
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
  } else {
    ctx.strokeStyle = COLORS.artworkStroke
    ctx.lineWidth = isSelected ? STROKE_WIDTHS.artworkSelected : STROKE_WIDTHS.artworkDefault
    ctx.setLineDash([])
  }
  ctx.stroke()
  ctx.setLineDash([])

  // Icône image
  ctx.fillStyle = COLORS.artworkStroke
  ctx.font = `${FONTS.iconSize * zoom}px ${FONTS.iconFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🖼', pos.x, pos.y)

  // Nom si disponible
  if (artwork.name) {
    ctx.font = `${FONTS.labelSize * zoom}px ${FONTS.labelFamily}`
    ctx.fillText(artwork.name, pos.x, pos.y + height/2 + 10)
  }
}
