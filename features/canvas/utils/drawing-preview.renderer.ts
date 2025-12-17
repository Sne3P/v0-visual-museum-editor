/**
 * RENDU DU PREVIEW DE DESSIN
 * Affiche l'indicateur visuel lors du tracé (points + lignes de preview)
 */

import type { Point, Tool } from '@/core/entities'
import { GRID_SIZE, VISUAL_FEEDBACK } from '@/core/constants'

interface PreviewOptions {
  currentPoints: Point[]
  previewPoint: Point | null
  tool: Tool
  zoom: number
  isValidPlacement: boolean
}

/**
 * Convertit coordonnées monde vers écran
 */
function worldToScreen(worldX: number, worldY: number, zoom: number, pan: Point): Point {
  return {
    x: worldX * zoom + pan.x,
    y: worldY * zoom + pan.y
  }
}

/**
 * Dessine le preview lors du tracé d'une pièce
 */
export function drawDrawingPreview(
  ctx: CanvasRenderingContext2D,
  options: PreviewOptions,
  pan: Point
) {
  const { currentPoints, previewPoint, tool, zoom, isValidPlacement } = options

  // Uniquement pour les outils de dessin
  if (tool !== 'room' && tool !== 'rectangle' && tool !== 'circle' && tool !== 'triangle' && tool !== 'arc') {
    return
  }

  // Si on a des points en cours de dessin
  if (currentPoints.length > 0 && tool === 'room') {
    ctx.save()
    
    // 1. Dessiner les lignes entre les points existants
    ctx.beginPath()
    const firstPoint = worldToScreen(
      currentPoints[0].x * GRID_SIZE,
      currentPoints[0].y * GRID_SIZE,
      zoom,
      pan
    )
    ctx.moveTo(firstPoint.x, firstPoint.y)

    for (let i = 1; i < currentPoints.length; i++) {
      const point = worldToScreen(
        currentPoints[i].x * GRID_SIZE,
        currentPoints[i].y * GRID_SIZE,
        zoom,
        pan
      )
      ctx.lineTo(point.x, point.y)
    }

    // 2. Si on a un point de preview, dessiner la ligne vers ce point
    if (previewPoint) {
      const hoverScreen = worldToScreen(
        previewPoint.x * GRID_SIZE,
        previewPoint.y * GRID_SIZE,
        zoom,
        pan
      )

      // Vérifier si on est proche du premier point (fermeture du polygone)
      const distanceToFirst = Math.hypot(
        previewPoint.x - currentPoints[0].x,
        previewPoint.y - currentPoints[0].y
      )

      const closeThreshold = 0.5 // 0.5 mètre
      const isClosing = distanceToFirst < closeThreshold && currentPoints.length >= 3

      if (isClosing) {
        // Fermer le polygone vers le premier point
        ctx.lineTo(firstPoint.x, firstPoint.y)
        ctx.closePath()

        // Remplissage avec transparence
        ctx.fillStyle = isValidPlacement 
          ? 'rgba(34, 197, 94, 0.15)' 
          : 'rgba(239, 68, 68, 0.15)'
        ctx.fill()

        // Indicateur de fermeture avec pulsation
        const pulseRadius = 6 + Math.sin(Date.now() / 200) * 2
        ctx.beginPath()
        ctx.arc(firstPoint.x, firstPoint.y, pulseRadius * zoom, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(34, 197, 94, 0.6)'
        ctx.fill()
        ctx.strokeStyle = 'rgb(255, 255, 255)'
        ctx.lineWidth = 2 * zoom
        ctx.stroke()

        // Cercle extérieur pour indiquer la zone de fermeture
        ctx.beginPath()
        ctx.arc(firstPoint.x, firstPoint.y, closeThreshold * GRID_SIZE * zoom, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'
        ctx.lineWidth = 1 * zoom
        ctx.setLineDash([5 * zoom, 5 * zoom])
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        // Ligne de preview vers le point courant (pointillés)
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.6)'
        ctx.lineWidth = 2 * zoom
        ctx.setLineDash([10 * zoom, 5 * zoom])
        ctx.lineTo(hoverScreen.x, hoverScreen.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Point de preview à la position de la souris
        ctx.beginPath()
        ctx.arc(hoverScreen.x, hoverScreen.y, 4 * zoom, 0, Math.PI * 2)
        ctx.fillStyle = isValidPlacement 
          ? 'rgba(59, 130, 246, 0.8)' 
          : 'rgba(239, 68, 68, 0.8)'
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 2 * zoom
        ctx.stroke()
      }
    }

    // 3. Contour du polygone en cours
    ctx.beginPath()
    ctx.moveTo(firstPoint.x, firstPoint.y)
    for (let i = 1; i < currentPoints.length; i++) {
      const point = worldToScreen(
        currentPoints[i].x * GRID_SIZE,
        currentPoints[i].y * GRID_SIZE,
        zoom,
        pan
      )
      ctx.lineTo(point.x, point.y)
    }
    if (previewPoint) {
      const hoverScreen = worldToScreen(
        previewPoint.x * GRID_SIZE,
        previewPoint.y * GRID_SIZE,
        zoom,
        pan
      )
      ctx.lineTo(hoverScreen.x, hoverScreen.y)
    }

    ctx.strokeStyle = isValidPlacement 
      ? VISUAL_FEEDBACK.colors.valid 
      : VISUAL_FEEDBACK.colors.invalid
    ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
    ctx.stroke()

    // 4. Dessiner les points (vertices) existants
    currentPoints.forEach((point, index) => {
      const screenPoint = worldToScreen(
        point.x * GRID_SIZE,
        point.y * GRID_SIZE,
        zoom,
        pan
      )

      ctx.beginPath()
      ctx.arc(screenPoint.x, screenPoint.y, 5, 0, Math.PI * 2)
      
      // Premier point en vert, autres en bleu
      if (index === 0) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.9)'
      } else {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'
      }
      ctx.fill()
      
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()

      // Numéro du point
      ctx.fillStyle = 'white'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), screenPoint.x, screenPoint.y)
    })

    ctx.restore()
  }

  // Pour les formes géométriques (rectangle, cercle, etc.), afficher un preview simple
  if (previewPoint && currentPoints.length === 1 && (tool === 'rectangle' || tool === 'circle')) {
    ctx.save()
    
    const startScreen = worldToScreen(
      currentPoints[0].x * GRID_SIZE,
      currentPoints[0].y * GRID_SIZE,
      zoom,
      pan
    )
    const endScreen = worldToScreen(
      previewPoint.x * GRID_SIZE,
      previewPoint.y * GRID_SIZE,
      zoom,
      pan
    )

    ctx.strokeStyle = isValidPlacement 
      ? VISUAL_FEEDBACK.colors.valid 
      : VISUAL_FEEDBACK.colors.invalid
    ctx.lineWidth = VISUAL_FEEDBACK.stroke.previewThickness
    ctx.setLineDash([10, 5])  // Dash pattern constant à l'écran

    if (tool === 'rectangle') {
      const width = endScreen.x - startScreen.x
      const height = endScreen.y - startScreen.y
      ctx.strokeRect(startScreen.x, startScreen.y, width, height)
      
      ctx.fillStyle = isValidPlacement 
        ? 'rgba(34, 197, 94, 0.1)' 
        : 'rgba(239, 68, 68, 0.1)'
      ctx.fillRect(startScreen.x, startScreen.y, width, height)
    } else if (tool === 'circle') {
      const radius = Math.hypot(endScreen.x - startScreen.x, endScreen.y - startScreen.y)
      ctx.beginPath()
      ctx.arc(startScreen.x, startScreen.y, radius, 0, Math.PI * 2)
      ctx.stroke()
      
      ctx.fillStyle = isValidPlacement 
        ? 'rgba(34, 197, 94, 0.1)' 
        : 'rgba(239, 68, 68, 0.1)'
      ctx.fill()
    }

    ctx.setLineDash([])
    ctx.restore()
  }
}
