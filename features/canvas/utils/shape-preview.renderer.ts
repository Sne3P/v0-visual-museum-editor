/**
 * Renderer pour la prévisualisation des formes en cours de création
 * Affiche un feedback visuel professionnel avec :
 * - Couleur selon validation (vert = OK, rouge = erreur, orange = warning)
 * - Opacité pour distinguer preview vs forme finale
 * - Animation de pointillés pour indiquer le mode création
 * - Points de contrôle visibles
 */

import type { Point } from '@/core/entities'
import { VISUAL_FEEDBACK } from '@/core/constants'
import { worldToScreen } from './coordinates.utils'

interface ShapePreviewOptions {
  polygon: Point[]
  isValid: boolean
  validationSeverity: 'error' | 'warning' | 'info' | null
  zoom: number
  pan: Point
  showVertices?: boolean
  showMeasurements?: boolean
  animationPhase?: number // Pour animer les pointillés
}

/**
 * Dessine la prévisualisation d'une forme en cours de création
 */
export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  options: ShapePreviewOptions
) {
  const {
    polygon,
    isValid,
    validationSeverity,
    zoom,
    pan,
    showVertices = true,
    animationPhase = 0
  } = options

  if (polygon.length === 0) return

  // Déterminer la couleur selon la validation
  let fillColor: string
  let strokeColor: string
  let opacity: number

  if (!isValid || validationSeverity === 'error') {
    fillColor = VISUAL_FEEDBACK.colors.invalid
    strokeColor = VISUAL_FEEDBACK.colors.invalid
    opacity = 0.3
  } else if (validationSeverity === 'warning') {
    fillColor = VISUAL_FEEDBACK.colors.warning
    strokeColor = VISUAL_FEEDBACK.colors.warning
    opacity = 0.4
  } else {
    fillColor = VISUAL_FEEDBACK.colors.valid
    strokeColor = VISUAL_FEEDBACK.colors.valid
    opacity = 0.35
  }

  // 1. Dessiner le remplissage
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = fillColor

  ctx.beginPath()
  const firstPoint = worldToScreen(polygon[0], zoom, pan)
  ctx.moveTo(firstPoint.x, firstPoint.y)
  
  for (let i = 1; i < polygon.length; i++) {
    const point = worldToScreen(polygon[i], zoom, pan)
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 2. Dessiner le contour avec pointillés animés
  ctx.save()
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
  ctx.globalAlpha = 0.9

  // Pointillés animés pour montrer que c'est une preview
  const dashLength = 10
  const gapLength = 8
  ctx.setLineDash([dashLength, gapLength])
  ctx.lineDashOffset = -animationPhase * 2 // Animation

  ctx.beginPath()
  ctx.moveTo(firstPoint.x, firstPoint.y)
  for (let i = 1; i < polygon.length; i++) {
    const point = worldToScreen(polygon[i], zoom, pan)
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  // 3. Dessiner les sommets (points de contrôle)
  if (showVertices) {
    ctx.save()
    for (const vertex of polygon) {
      const screenPoint = worldToScreen(vertex, zoom, pan)
      
      // Cercle extérieur blanc
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(screenPoint.x, screenPoint.y, 5, 0, Math.PI * 2)
      ctx.fill()
      
      // Cercle intérieur coloré
      ctx.fillStyle = strokeColor
      ctx.beginPath()
      ctx.arc(screenPoint.x, screenPoint.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // 4. Dessiner les dimensions si demandé (à implémenter si besoin)
  // if (showMeasurements) {
  //   drawPreviewMeasurements(ctx, polygon, zoom, pan)
  // }
}

/**
 * Dessine un point de snap (indique où le prochain point sera créé)
 */
export function drawSnapPoint(
  ctx: CanvasRenderingContext2D,
  point: Point,
  zoom: number,
  pan: Point,
  isSnapped: boolean = true
) {
  const screenPoint = worldToScreen(point, zoom, pan)
  
  ctx.save()
  
  // Cercle extérieur pulsant
  const pulseRadius = isSnapped ? 8 : 6
  ctx.strokeStyle = isSnapped ? VISUAL_FEEDBACK.colors.valid : VISUAL_FEEDBACK.colors.neutral
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.arc(screenPoint.x, screenPoint.y, pulseRadius, 0, Math.PI * 2)
  ctx.stroke()
  
  // Point central
  ctx.fillStyle = isSnapped ? VISUAL_FEEDBACK.colors.valid : VISUAL_FEEDBACK.colors.neutral
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.arc(screenPoint.x, screenPoint.y, 3, 0, Math.PI * 2)
  ctx.fill()
  
  // Croix pour indiquer le snap sur la grille
  if (isSnapped) {
    ctx.strokeStyle = VISUAL_FEEDBACK.colors.valid
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.7
    const crossSize = 10
    
    ctx.beginPath()
    ctx.moveTo(screenPoint.x - crossSize, screenPoint.y)
    ctx.lineTo(screenPoint.x + crossSize, screenPoint.y)
    ctx.moveTo(screenPoint.x, screenPoint.y - crossSize)
    ctx.lineTo(screenPoint.x, screenPoint.y + crossSize)
    ctx.stroke()
  }
  
  ctx.restore()
}

/**
 * Dessine une ligne de guidage entre deux points
 */
export function drawGuideLine(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  zoom: number,
  pan: Point
) {
  const startScreen = worldToScreen(start, zoom, pan)
  const endScreen = worldToScreen(end, zoom, pan)
  
  ctx.save()
  ctx.strokeStyle = VISUAL_FEEDBACK.colors.neutral
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.4
  ctx.setLineDash([5, 5])
  
  ctx.beginPath()
  ctx.moveTo(startScreen.x, startScreen.y)
  ctx.lineTo(endScreen.x, endScreen.y)
  ctx.stroke()
  
  ctx.restore()
}

/**
 * Dessine le message de validation pendant la création
 */
export function drawValidationMessage(
  ctx: CanvasRenderingContext2D,
  message: string,
  severity: 'error' | 'warning' | 'info',
  position: Point // Position écran
) {
  ctx.save()
  
  // Fond du badge
  let bgColor: string
  switch (severity) {
    case 'error':
      bgColor = 'rgba(239, 68, 68, 0.95)' // red-500
      break
    case 'warning':
      bgColor = 'rgba(245, 158, 11, 0.95)' // amber-500
      break
    default:
      bgColor = 'rgba(59, 130, 246, 0.95)' // blue-500
  }
  
  ctx.font = '12px system-ui, -apple-system, sans-serif'
  const textWidth = ctx.measureText(message).width
  const padding = 10
  const badgeWidth = textWidth + padding * 2
  const badgeHeight = 24
  
  // Ombre
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2
  
  // Rectangle arrondi
  ctx.fillStyle = bgColor
  ctx.beginPath()
  ctx.roundRect(
    position.x - badgeWidth / 2,
    position.y - badgeHeight - 10,
    badgeWidth,
    badgeHeight,
    6
  )
  ctx.fill()
  
  ctx.shadowColor = 'transparent'
  
  // Texte
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    message,
    position.x,
    position.y - badgeHeight / 2 - 10
  )
  
  ctx.restore()
}
