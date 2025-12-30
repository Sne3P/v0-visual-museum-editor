/**
 * SERVICE ÉDITION LIENS VERTICAUX
 * - Modification position/taille
 * - Validation des contraintes
 * - Vérification dans room parent
 */

import type { Point, VerticalLink, Floor } from '@/core/entities'
import { isPointInPolygon } from './geometry.service'
import { validateVerticalLinkCreation, findRoomForVerticalLink } from './vertical-link.service'

/**
 * Valide le redimensionnement d'un vertical link
 */
export function validateVerticalLinkResize(
  link: VerticalLink,
  newSize: readonly [number, number],
  floor: Floor
): { valid: boolean; message?: string } {
  
  // Valider avec le service standard (en excluant le lien actuel)
  const validation = validateVerticalLinkCreation(link.position, newSize, link.type, floor, link.id)
  
  if (!validation.valid) {
    return { valid: false, message: validation.message }
  }

  // Vérifier que le lien reste dans UNE room (pas nécessairement la même)
  const halfWidth = newSize[0] / 2
  const halfHeight = newSize[1] / 2
  
  // Petite tolérance (epsilon) pour éviter les erreurs d'arrondi
  const epsilon = 1
  
  const corners = [
    { x: link.position.x - halfWidth + epsilon, y: link.position.y - halfHeight + epsilon },
    { x: link.position.x + halfWidth - epsilon, y: link.position.y - halfHeight + epsilon },
    { x: link.position.x + halfWidth - epsilon, y: link.position.y + halfHeight - epsilon },
    { x: link.position.x - halfWidth + epsilon, y: link.position.y + halfHeight - epsilon }
  ]
  
  let foundRoom = false
  for (const room of floor.rooms) {
    const allInside = corners.every(corner => isPointInPolygon(corner, room.polygon))
    if (allInside) {
      foundRoom = true
      break
    }
  }
  
  if (!foundRoom) {
    return { 
      valid: false, 
      message: 'Doit rester entièrement dans une pièce'
    }
  }

  return { valid: true }
}

/**
 * Applique le redimensionnement d'un lien vertical
 */
export function resizeVerticalLink(
  link: VerticalLink,
  newSize: readonly [number, number]
): VerticalLink {
  return {
    ...link,
    size: newSize
  }
}

/**
 * Valide le déplacement complet d'un vertical link
 */
export function validateVerticalLinkMove(
  link: VerticalLink,
  delta: Point,
  floor: Floor
): { valid: boolean; message?: string } {
  
  // Nouvelle position
  const newPosition = {
    x: link.position.x + delta.x,
    y: link.position.y + delta.y
  }

  // Valider avec le service standard (en excluant le lien actuel)
  const validation = validateVerticalLinkCreation(newPosition, link.size, link.type, floor, link.id)
  
  if (!validation.valid) {
    return { valid: false, message: validation.message }
  }

  // Vérifier que le lien reste dans UNE room (pas nécessairement la même)
  const halfWidth = link.size[0] / 2
  const halfHeight = link.size[1] / 2
  
  // Petite tolérance (epsilon) pour éviter les erreurs d'arrondi
  const epsilon = 1
  
  const corners = [
    { x: newPosition.x - halfWidth + epsilon, y: newPosition.y - halfHeight + epsilon },
    { x: newPosition.x + halfWidth - epsilon, y: newPosition.y - halfHeight + epsilon },
    { x: newPosition.x + halfWidth - epsilon, y: newPosition.y + halfHeight - epsilon },
    { x: newPosition.x - halfWidth + epsilon, y: newPosition.y + halfHeight - epsilon }
  ]
  
  let foundRoom = false
  for (const room of floor.rooms) {
    const allInside = corners.every(corner => isPointInPolygon(corner, room.polygon))
    if (allInside) {
      foundRoom = true
      break
    }
  }
  
  if (!foundRoom) {
    return { 
      valid: false, 
      message: 'Doit rester entièrement dans une pièce'
    }
  }

  return { valid: true }
}

/**
 * Applique le déplacement d'un lien vertical
 */
export function moveVerticalLink(
  link: VerticalLink,
  delta: Point
): VerticalLink {
  return {
    ...link,
    position: {
      x: link.position.x + delta.x,
      y: link.position.y + delta.y
    }
  }
}
