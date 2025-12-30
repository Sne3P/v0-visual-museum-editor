/**
 * SERVICE D'ÉDITION PAR VERTICES DES VERTICAL LINKS
 * Gère le déplacement des 4 coins du rectangle (position + size)
 */

import type { Point, VerticalLink, Floor, Room } from '@/core/entities'
import { isVerticalLinkInRoom } from './vertical-link.service'

/**
 * Convertir position+size en 4 corners
 */
export function getVerticalLinkCorners(link: VerticalLink): [Point, Point, Point, Point] {
  const halfWidth = link.size[0] / 2
  const halfHeight = link.size[1] / 2
  
  return [
    { x: link.position.x - halfWidth, y: link.position.y - halfHeight }, // Top-left (0)
    { x: link.position.x + halfWidth, y: link.position.y - halfHeight }, // Top-right (1)
    { x: link.position.x + halfWidth, y: link.position.y + halfHeight }, // Bottom-right (2)
    { x: link.position.x - halfWidth, y: link.position.y + halfHeight }  // Bottom-left (3)
  ]
}

/**
 * Index des coins opposés pour calcul du rectangle
 */
const OPPOSITE_CORNER: Record<number, number> = {
  0: 2, // Top-left ↔ Bottom-right
  1: 3, // Top-right ↔ Bottom-left
  2: 0,
  3: 1
}

/**
 * Calculer nouvelle position + size après déplacement d'un corner
 * Le corner opposé reste fixe, le corner déplacé définit la nouvelle zone
 */
export function updateVerticalLinkCorner(
  link: VerticalLink,
  cornerIndex: number,
  newCornerPosition: Point
): VerticalLink {
  if (cornerIndex < 0 || cornerIndex > 3) {
    return link
  }

  const corners = getVerticalLinkCorners(link)
  const oppositeIndex = OPPOSITE_CORNER[cornerIndex]
  const oppositeCorner = corners[oppositeIndex]

  // Calculer nouveau rectangle depuis corner opposé vers nouveau corner
  const minX = Math.min(oppositeCorner.x, newCornerPosition.x)
  const maxX = Math.max(oppositeCorner.x, newCornerPosition.x)
  const minY = Math.min(oppositeCorner.y, newCornerPosition.y)
  const maxY = Math.max(oppositeCorner.y, newCornerPosition.y)

  const width = maxX - minX
  const height = maxY - minY

  // Nouvelle position = centre du nouveau rectangle
  const centerX = minX + width / 2
  const centerY = minY + height / 2

  return {
    ...link,
    position: { x: centerX, y: centerY },
    size: [width, height]
  }
}

/**
 * Valider le déplacement d'un corner
 */
export function validateVerticalLinkCornerMove(
  link: VerticalLink,
  cornerIndex: number,
  newCornerPosition: Point,
  floor: Floor
): { valid: boolean; message?: string } {
  // Calculer le nouveau link
  const updatedLink = updateVerticalLinkCorner(link, cornerIndex, newCornerPosition)

  // Taille minimale : 40px (1 cellule grille)
  const MIN_SIZE = 40
  if (updatedLink.size[0] < MIN_SIZE || updatedLink.size[1] < MIN_SIZE) {
    return {
      valid: false,
      message: `Taille minimale : ${MIN_SIZE / 40}x${MIN_SIZE / 40} unités grille`
    }
  }

  // Vérifier que le link reste dans une room du floor
  const isInAnyRoom = floor.rooms.some((room: Room) => 
    isVerticalLinkInRoom(updatedLink, room)
  )
  
  if (!isInAnyRoom) {
    return {
      valid: false,
      message: 'Le lien vertical doit rester entièrement dans une pièce'
    }
  }

  // Vérifier chevauchement avec autres vertical links
  const { validateVerticalLinkCreation } = require('./vertical-link.service')
  const validation = validateVerticalLinkCreation(
    updatedLink.position,
    updatedLink.size,
    updatedLink.type, // IMPORTANT: type est maintenant le 3e paramètre
    floor,
    link.id // Exclure le link en cours d'édition
  )
  
  if (!validation.valid) {
    return {
      valid: false,
      message: validation.message ?? 'Position invalide'
    }
  }

  return { valid: true }
}
