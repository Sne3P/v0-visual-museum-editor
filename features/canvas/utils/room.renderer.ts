/**
 * RENDU DES PIÈCES - CAO PROFESSIONNEL
 * Avec validations et feedback visuel
 */

import type { Room, Point } from '@/core/entities'
import { worldToCanvas } from '@/core/utils'
import { validateRoomGeometry, calculatePolygonAreaInMeters } from '@/core/services'

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  room: Room,
  zoom: number,
  pan: Point,
  isSelected: boolean = false,
  isHovered: boolean = false,
  showValidation: boolean = true,
  isDuplicating: boolean = false,
  isValidDuplication: boolean = true
) {
  if (room.polygon.length < 3) return

  // Convertir les points du polygone en coordonnées canvas
  const canvasPoints = room.polygon.map(p => worldToCanvas(p, zoom, pan))

  // Validation temps réel (sauf si en duplication, on utilise l'état de duplication)
  const validation = (showValidation && !isDuplicating) ? validateRoomGeometry(room) : null
  const hasError = isDuplicating ? !isValidDuplication : (validation !== null && !validation.valid)

  // Remplissage
  ctx.beginPath()
  ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)
  for (let i = 1; i < canvasPoints.length; i++) {
    ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y)
  }
  ctx.closePath()

  // Couleur de fond avec états de validation
  if (hasError) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)' // Rouge si erreur (plus opaque)
  } else if (isSelected || isDuplicating) {
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)' // Bleu si sélectionné ou en duplication
  } else if (isHovered) {
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)' // Bleu clair si survolé
  } else {
    ctx.fillStyle = 'rgba(229, 231, 235, 0.5)' // Gris clair par défaut
  }
  ctx.fill()

  // Contour avec validation
  if (hasError) {
    ctx.strokeStyle = '#EF4444' // Rouge
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4]) // Pointillés épais pour erreur
  } else if (isSelected || isDuplicating) {
    ctx.strokeStyle = '#3B82F6' // Bleu
    ctx.lineWidth = 3
    ctx.setLineDash([])
  } else if (isHovered) {
    ctx.strokeStyle = '#60A5FA' // Bleu clair
    ctx.lineWidth = 2.5
    ctx.setLineDash([])
  } else {
    ctx.strokeStyle = '#9CA3AF' // Gris
    ctx.lineWidth = 2
    ctx.setLineDash([])
  }
  ctx.stroke()
  ctx.setLineDash([])

  // Afficher les mesures si sélectionné ou survolé
  if ((isSelected || isHovered) && room.polygon.length >= 3) {
    const area = calculatePolygonAreaInMeters(room.polygon)
    const center = getPolygonCenter(canvasPoints)
    
    // Fond du label
    ctx.fillStyle = hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 0, 0, 0.8)'
    ctx.font = 'bold 13px system-ui'
    const text = `${area.toFixed(2)} m²`
    const metrics = ctx.measureText(text)
    const padding = 8
    
    ctx.fillRect(
      center.x - metrics.width / 2 - padding,
      center.y - 10,
      metrics.width + padding * 2,
      24
    )
    
    // Texte
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, center.x, center.y)
    
    // Message d'erreur si validation échoue
    if (hasError && validation && validation.valid === false) {
      const errorMessage = (validation as any).message || 'Erreur de validation'
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)'
      ctx.font = '11px system-ui'
      const errorMetrics = ctx.measureText(errorMessage)
      ctx.fillRect(
        center.x - errorMetrics.width / 2 - padding,
        center.y + 20,
        errorMetrics.width + padding * 2,
        20
      )
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(errorMessage, center.x, center.y + 30)
    }
  }

  // Afficher les dimensions des côtés si zoom suffisant
  if (zoom > 20 && (isSelected || isHovered)) {
    ctx.fillStyle = '#000000'
    ctx.font = '10px monospace'
    
    for (let i = 0; i < canvasPoints.length; i++) {
      const p1 = room.polygon[i]
      const p2 = room.polygon[(i + 1) % room.polygon.length]
      const distance = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      )
      
      const c1 = canvasPoints[i]
      const c2 = canvasPoints[(i + 1) % canvasPoints.length]
      const midX = (c1.x + c2.x) / 2
      const midY = (c1.y + c2.y) / 2
      
      ctx.save()
      ctx.translate(midX, midY)
      const angle = Math.atan2(c2.y - c1.y, c2.x - c1.x)
      ctx.rotate(angle)
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      const dimText = `${distance.toFixed(2)}m`
      const dimMetrics = ctx.measureText(dimText)
      ctx.fillRect(-dimMetrics.width / 2 - 4, -8, dimMetrics.width + 8, 14)
      
      ctx.fillStyle = '#000000'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(dimText, 0, 0)
      ctx.restore()
    }
  }
}

function getPolygonCenter(points: Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
