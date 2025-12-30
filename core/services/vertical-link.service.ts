/**
 * SERVICE GESTION LIENS VERTICAUX (Escaliers/Ascenseurs)
 * - Validation contraintes de création/modification
 * - Vérification position dans room
 * - Gestion liens techniques multi-étages (PAS de représentation visuelle dans autres étages)
 */

import type { Point, VerticalLink, Floor, Room } from '@/core/entities'
import { isPointInPolygon } from './geometry.service'

/**
 * Vérifie si un lien vertical est dans une room
 */
export function isVerticalLinkInRoom(link: VerticalLink, room: Room): boolean {
  // Calcule le rectangle du lien
  const rect = getVerticalLinkBounds(link)
  
  // Petite tolérance (epsilon) pour éviter les erreurs d'arrondi (1 pixel)
  const epsilon = 1
  
  // Tous les coins du rectangle doivent être dans la room (avec tolérance)
  const corners = [
    { x: rect.minX + epsilon, y: rect.minY + epsilon },
    { x: rect.maxX - epsilon, y: rect.minY + epsilon },
    { x: rect.maxX - epsilon, y: rect.maxY - epsilon },
    { x: rect.minX + epsilon, y: rect.maxY - epsilon }
  ]
  
  return corners.every(point => isPointInPolygon(point, room.polygon))
}

/**
 * Calcule les limites du rectangle d'un lien vertical
 */
export function getVerticalLinkBounds(link: VerticalLink) {
  const halfWidth = link.size[0] / 2
  const halfHeight = link.size[1] / 2
  
  return {
    minX: link.position.x - halfWidth,
    maxX: link.position.x + halfWidth,
    minY: link.position.y - halfHeight,
    maxY: link.position.y + halfHeight
  }
}

/**
 * Trouve la room qui contient un lien vertical
 */
export function findRoomForVerticalLink(link: VerticalLink, floor: Floor): Room | null {
  for (const room of floor.rooms) {
    if (isVerticalLinkInRoom(link, room)) {
      return room
    }
  }
  return null
}

/**
 * Valide qu'un lien vertical peut être créé/modifié
 */
export function validateVerticalLinkCreation(
  position: Point,
  size: readonly [number, number],
  type: 'stairs' | 'elevator',
  floor: Floor,
  excludeLinkId?: string  // ID du lien à exclure (lors d'édition)
): { valid: boolean; message: string; severity?: 'error' | 'warning' | 'info' } {
  
  const halfWidth = size[0] / 2
  const halfHeight = size[1] / 2
  
  // Petite tolérance (epsilon) pour éviter les erreurs d'arrondi
  const epsilon = 1
  
  // Calcule les coins du rectangle (avec tolérance vers l'intérieur)
  const corners = [
    { x: position.x - halfWidth + epsilon, y: position.y - halfHeight + epsilon },
    { x: position.x + halfWidth - epsilon, y: position.y - halfHeight + epsilon },
    { x: position.x + halfWidth - epsilon, y: position.y + halfHeight - epsilon },
    { x: position.x - halfWidth + epsilon, y: position.y + halfHeight - epsilon }
  ]

  // Vérifier que tous les coins sont dans une même room
  let containingRoom: Room | null = null
  
  for (const room of floor.rooms) {
    const allCornersIn = corners.every(corner => isPointInPolygon(corner, room.polygon))
    if (allCornersIn) {
      containingRoom = room
      break
    }
  }

  if (!containingRoom) {
    return { 
      valid: false, 
      message: type === 'stairs' ? 'L\'escalier doit être entièrement dans une pièce' : 'L\'ascenseur doit être entièrement dans une pièce',
      severity: 'error' 
    }
  }

  // Vérifier qu'il n'y a pas de chevauchement avec d'autres liens verticaux du même étage
  for (const existingLink of floor.verticalLinks) {
    // Exclure le lien en cours d'édition
    if (excludeLinkId && existingLink.id === excludeLinkId) continue
    
    // Ignorer les liens d'autres étages
    if (existingLink.floorId !== floor.id) continue
    
    if (rectanglesOverlap(position, size, existingLink.position, existingLink.size)) {
      return {
        valid: false,
        message: 'Ne peut pas chevaucher un autre lien vertical',
        severity: 'error'
      }
    }
  }

  // Vérifier chevauchement avec artworks
  for (const artwork of floor.artworks) {
    const artworkPoint = { x: artwork.xy[0], y: artwork.xy[1] }
    const dist = Math.sqrt(
      Math.pow(position.x - artworkPoint.x, 2) + 
      Math.pow(position.y - artworkPoint.y, 2)
    )
    if (dist < (halfWidth + halfHeight) / 2 + 40) { // Zone de sécurité
      return {
        valid: false,
        message: 'Trop proche d\'une œuvre',
        severity: 'error'
      }
    }
  }

  return { valid: true, message: 'OK' }
}

/**
 * Vérifie si deux rectangles se chevauchent
 */
function rectanglesOverlap(
  pos1: Point, 
  size1: readonly [number, number],
  pos2: Point, 
  size2: readonly [number, number]
): boolean {
  const rect1 = {
    minX: pos1.x - size1[0] / 2,
    maxX: pos1.x + size1[0] / 2,
    minY: pos1.y - size1[1] / 2,
    maxY: pos1.y + size1[1] / 2
  }
  
  const rect2 = {
    minX: pos2.x - size2[0] / 2,
    maxX: pos2.x + size2[0] / 2,
    minY: pos2.y - size2[1] / 2,
    maxY: pos2.y + size2[1] / 2
  }
  
  return !(rect1.maxX <= rect2.minX || 
           rect1.minX >= rect2.maxX || 
           rect1.maxY <= rect2.minY || 
           rect1.minY >= rect2.maxY)
}

/**
 * Valide le déplacement d'une room contenant des liens verticaux
 */
export function validateRoomMoveWithVerticalLinks(
  room: Room,
  newPolygon: Point[],
  floor: Floor
): { valid: boolean; message?: string } {
  
  // Trouver tous les liens verticaux dans cette room (pour cet étage uniquement)
  const linksInRoom = floor.verticalLinks.filter(link => 
    link.roomId === room.id && link.floorId === floor.id
  )
  
  if (linksInRoom.length === 0) {
    return { valid: true }
  }

  // Calculer le déplacement
  const oldCenter = getPolygonCenter(room.polygon)
  const newCenter = getPolygonCenter(newPolygon)
  const delta = {
    x: newCenter.x - oldCenter.x,
    y: newCenter.y - oldCenter.y
  }

  // Vérifier que chaque lien déplacé reste dans la nouvelle room
  for (const link of linksInRoom) {
    const newPosition = {
      x: link.position.x + delta.x,
      y: link.position.y + delta.y
    }
    
    // Vérifier que tous les coins du rectangle restent dans la room
    const halfWidth = link.size[0] / 2
    const halfHeight = link.size[1] / 2
    
    const corners = [
      { x: newPosition.x - halfWidth, y: newPosition.y - halfHeight },
      { x: newPosition.x + halfWidth, y: newPosition.y - halfHeight },
      { x: newPosition.x + halfWidth, y: newPosition.y + halfHeight },
      { x: newPosition.x - halfWidth, y: newPosition.y + halfHeight }
    ]
    
    const allInside = corners.every(corner => isPointInPolygon(corner, newPolygon))
    
    if (!allInside) {
      return { 
        valid: false, 
        message: `Impossible: ${link.type === 'stairs' ? 'escalier' : 'ascenseur'} sortirait de la pièce`
      }
    }
  }

  return { valid: true }
}

/**
 * Déplace les liens verticaux d'une room quand elle est déplacée
 */
export function moveVerticalLinksWithRoom(
  room: Room,
  newPolygon: Point[],
  floor: Floor
): VerticalLink[] {
  
  const linksInRoom = floor.verticalLinks.filter(link => 
    link.roomId === room.id && link.floorId === floor.id
  )
  
  if (linksInRoom.length === 0) {
    return floor.verticalLinks as VerticalLink[]
  }

  // Calculer le déplacement
  const oldCenter = getPolygonCenter(room.polygon)
  const newCenter = getPolygonCenter(newPolygon)
  const delta = {
    x: newCenter.x - oldCenter.x,
    y: newCenter.y - oldCenter.y
  }

  // Déplacer les liens de cet étage uniquement
  return floor.verticalLinks.map(link => {
    if (link.roomId !== room.id || link.floorId !== floor.id) return link

    return {
      ...link,
      position: {
        x: link.position.x + delta.x,
        y: link.position.y + delta.y
      }
    }
  })
}

/**
 * Supprime un étage des liens verticaux (quand un étage est supprimé)
 * Si un lien n'a plus qu'un seul étage connecté après suppression, il est supprimé
 */
export function removeFloorFromVerticalLinks(
  floorId: string,
  verticalLinks: ReadonlyArray<VerticalLink>
): VerticalLink[] {
  
  return verticalLinks
    .map(link => {
      // Supprimer l'étage de la liste des connexions
      const newFloorIds = link.connectedFloorIds.filter((id: string) => id !== floorId)
      
      // Si le lien était physiquement sur cet étage, le supprimer
      if (link.floorId === floorId) {
        return null
      }
      
      // Si plus qu'un seul étage connecté (ou aucun), supprimer le lien
      if (newFloorIds.length <= 1) {
        return null
      }
      
      return {
        ...link,
        connectedFloorIds: newFloorIds as readonly string[]
      }
    })
    .filter((link): link is VerticalLink => link !== null) as VerticalLink[]
}

/**
 * Supprime les liens verticaux d'une room quand elle est supprimée
 * IMPORTANT: Supprime uniquement les liens physiquement situés dans cette room
 */
export function removeVerticalLinksFromRoom(
  roomId: string,
  verticalLinks: ReadonlyArray<VerticalLink>
): VerticalLink[] {
  return verticalLinks.filter(link => link.roomId !== roomId) as VerticalLink[]
}

/**
 * Calcule le centre d'un polygone
 */
function getPolygonCenter(polygon: ReadonlyArray<Point>): Point {
  const sum = polygon.reduce((acc, p) => ({
    x: acc.x + p.x,
    y: acc.y + p.y
  }), { x: 0, y: 0 })
  
  return {
    x: sum.x / polygon.length,
    y: sum.y / polygon.length
  }
}
