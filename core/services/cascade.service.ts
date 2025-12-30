/**
 * SERVICE CASCADE - Gestion des relations parent-enfant et actions en cascade
 * 
 * Principe: Les éléments ont des relations hiérarchiques:
 * - Room (parent) → Walls, Doors, Artworks, VerticalLinks (enfants)
 * - Si parent modifié/supprimé → enfants suivent automatiquement
 */

import type { Floor, Room, Wall, Door, Artwork, Point } from '@/core/entities'
import { translatePolygon, translateWall, translateDoor, translateArtwork } from './transform.service'
import { isPointInPolygon } from './geometry.service'
import { getDoorsToDeleteWithRoom } from './door-constraints.service'
import { removeVerticalLinksFromRoom, moveVerticalLinksWithRoom, validateRoomMoveWithVerticalLinks } from './vertical-link.service'

/**
 * Récupérer tous les éléments enfants d'une room
 * IMPORTANT: Les liens verticaux sont récupérés uniquement pour cet étage (floorId)
 */
export function getRoomChildren(floor: Floor, roomId: string) {
  return {
    walls: floor.walls?.filter(w => w.roomId === roomId) || [],
    doors: floor.doors?.filter(d => d.roomId === roomId) || [],
    artworks: floor.artworks?.filter(a => a.roomId === roomId) || [],
    verticalLinks: floor.verticalLinks?.filter(vl => 
      vl.roomId === roomId && vl.floorId === floor.id
    ) || []
  }
}

/**
 * Supprimer une room ET tous ses enfants (cascade)
 * Inclut aussi les portes qui connectent cette room à d'autres
 */
export function deleteRoomWithChildren(floor: Floor, roomId: string): Floor {
  const children = getRoomChildren(floor, roomId)
  
  // NOUVEAU: Trouver aussi les portes à supprimer (qui connectent cette room)
  const doorsToDelete = getDoorsToDeleteWithRoom(roomId, floor)
  
  // Supprimer aussi les liens verticaux de cette room
  const verticalLinksWithoutRoom = removeVerticalLinksFromRoom(roomId, floor.verticalLinks)
  
  return {
    ...floor,
    rooms: floor.rooms.filter(r => r.id !== roomId),
    walls: floor.walls?.filter(w => !children.walls.some(cw => cw.id === w.id)),
    doors: floor.doors?.filter(d => !doorsToDelete.some(dtd => dtd.id === d.id)),
    artworks: floor.artworks?.filter(a => !children.artworks.some(ca => ca.id === a.id)),
    verticalLinks: verticalLinksWithoutRoom
  }
}

/**
 * Déplacer une room ET tous ses enfants
 */
export function translateRoomWithChildren(
  floor: Floor, 
  roomId: string, 
  delta: Point
): Floor {
  const children = getRoomChildren(floor, roomId)
  
  const updatedRoom = floor.rooms.find(r => r.id === roomId)
  if (!updatedRoom) return floor
  
  const newPolygon = translatePolygon(updatedRoom.polygon, delta)
  
  // Valider que les liens verticaux peuvent suivre
  const vlValidation = validateRoomMoveWithVerticalLinks(
    updatedRoom,
    newPolygon,
    floor
  )
  
  if (!vlValidation.valid) {
    // Ne pas appliquer le déplacement si ça fait sortir un lien vertical
    return floor
  }
  
  // Déplacer les liens verticaux
  const movedVerticalLinks = moveVerticalLinksWithRoom(updatedRoom, newPolygon, floor)
  
  return {
    ...floor,
    rooms: floor.rooms.map(r => {
      if (r.id !== roomId) return r
      return {
        ...r,
        polygon: newPolygon
      }
    }),
    walls: floor.walls?.map(w => {
      if (!children.walls.some(cw => cw.id === w.id)) return w
      return translateWall(w, delta)
    }),
    doors: floor.doors?.map(d => {
      if (!children.doors.some(cd => cd.id === d.id)) return d
      return translateDoor(d, delta)
    }),
    artworks: floor.artworks?.map(a => {
      if (!children.artworks.some(ca => ca.id === a.id)) return a
      return translateArtwork(a, delta)
    }),
    verticalLinks: movedVerticalLinks
  }
}

/**
 * Valider qu'un changement de room ne met pas ses murs ou liens verticaux hors limites
 */
export function validateRoomModificationWithWalls(
  updatedRoom: Room,
  floor: Floor
): { valid: boolean; reason?: string } {
  const children = getRoomChildren(floor, updatedRoom.id)
  
  // Vérifier que TOUS les points de TOUS les murs enfants sont dans la nouvelle room
  for (const wall of children.walls) {
    const points = wall.path || [wall.segment[0], wall.segment[1]]
    
    for (const point of points) {
      if (!isPointInPolygon(point, updatedRoom.polygon)) {
        return {
          valid: false,
          reason: `Le mur ${wall.id} serait placé hors de la pièce après modification`
        }
      }
    }
  }
  
  // Vérifier que les liens verticaux restent dans la room
  for (const vl of children.verticalLinks) {
    const halfWidth = vl.size[0] / 2
    const halfHeight = vl.size[1] / 2
    
    const corners = [
      { x: vl.position.x - halfWidth, y: vl.position.y - halfHeight },
      { x: vl.position.x + halfWidth, y: vl.position.y - halfHeight },
      { x: vl.position.x + halfWidth, y: vl.position.y + halfHeight },
      { x: vl.position.x - halfWidth, y: vl.position.y + halfHeight }
    ]
    
    for (const corner of corners) {
      if (!isPointInPolygon(corner, updatedRoom.polygon)) {
        return {
          valid: false,
          reason: `Un ${vl.type === 'stairs' ? 'escalier' : 'ascenseur'} sortirait de la pièce après modification`
        }
      }
    }
  }
  
  return { valid: true }
}

/**
 * Attacher automatiquement un mur à sa room parente
 */
export function attachWallToRoom(wall: Wall, floor: Floor): Wall {
  // Trouver quelle room contient ce mur
  for (const room of floor.rooms) {
    const points = wall.path || [wall.segment[0], wall.segment[1]]
    const allPointsInRoom = points.every(p => isPointInPolygon(p, room.polygon))
    
    if (allPointsInRoom) {
      return { ...wall, roomId: room.id }
    }
  }
  
  // Aucune room ne contient le mur → pas de roomId
  return { ...wall, roomId: undefined }
}
