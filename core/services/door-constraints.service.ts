/**
 * SERVICE CONTRAINTES PORTES
 * Gestion des contraintes de déplacement/modification pour pièces liées par des portes
 */

import type { Point, Room, Door, Floor } from '@/core/entities'
import { distance, distanceToSegment } from './geometry.service'

/**
 * Vérifie si une pièce a des portes
 */
export function roomHasDoors(roomId: string, floor: Floor): boolean {
  return floor.doors.some(door => door.room_a === roomId || door.room_b === roomId)
}

/**
 * Trouve toutes les portes connectées à une pièce
 */
export function findDoorsForRoom(roomId: string, floor: Floor): Door[] {
  return floor.doors.filter(door => door.room_a === roomId || door.room_b === roomId)
}

/**
 * Trouve les pièces connectées à une pièce par des portes
 */
export function findConnectedRooms(roomId: string, floor: Floor): string[] {
  const connected: string[] = []
  
  for (const door of floor.doors) {
    if (door.room_a === roomId && !connected.includes(door.room_b)) {
      connected.push(door.room_b)
    }
    if (door.room_b === roomId && !connected.includes(door.room_a)) {
      connected.push(door.room_a)
    }
  }
  
  return connected
}

/**
 * Vérifie si une porte est toujours valide après modification d'une pièce
 * Vérifie que les deux extrémités de la porte sont encore sur les edges des deux pièces
 */
export function isDoorStillValid(
  door: Door,
  modifiedRoomId: string,
  newPolygon: ReadonlyArray<Point>,
  floor: Floor
): boolean {
  // Récupérer l'autre pièce (celle qui n'a pas été modifiée)
  const otherRoomId = door.room_a === modifiedRoomId ? door.room_b : door.room_a
  const otherRoom = floor.rooms.find(r => r.id === otherRoomId)
  
  if (!otherRoom) return false

  // Les doors sont déjà en pixels
  const doorStartPixels = {
    x: door.segment[0].x,
    y: door.segment[0].y
  }
  const doorEndPixels = {
    x: door.segment[1].x,
    y: door.segment[1].y
  }

  // Vérifier que les deux extrémités sont sur un edge du nouveau polygone
  const TOLERANCE = 15 // pixels - tolérance pour être "sur" un edge
  
  let startOnNewPolygon = false
  let endOnNewPolygon = false
  
  for (let i = 0; i < newPolygon.length; i++) {
    const p1 = newPolygon[i]
    const p2 = newPolygon[(i + 1) % newPolygon.length]
    
    const distStart = distanceToSegment(doorStartPixels, p1, p2)
    const distEnd = distanceToSegment(doorEndPixels, p1, p2)
    
    if (distStart < TOLERANCE) startOnNewPolygon = true
    if (distEnd < TOLERANCE) endOnNewPolygon = true
  }

  if (!startOnNewPolygon || !endOnNewPolygon) return false

  // Vérifier aussi pour l'autre pièce (non modifiée)
  let startOnOtherRoom = false
  let endOnOtherRoom = false
  
  for (let i = 0; i < otherRoom.polygon.length; i++) {
    const p1 = otherRoom.polygon[i]
    const p2 = otherRoom.polygon[(i + 1) % otherRoom.polygon.length]
    
    const distStart = distanceToSegment(doorStartPixels, p1, p2)
    const distEnd = distanceToSegment(doorEndPixels, p1, p2)
    
    if (distStart < TOLERANCE) startOnOtherRoom = true
    if (distEnd < TOLERANCE) endOnOtherRoom = true
  }

  return startOnOtherRoom && endOnOtherRoom
}

/**
 * Valide le déplacement d'une pièce qui a des portes
 * Retourne les portes qui deviendraient invalides
 */
export function validateRoomMoveWithDoors(
  roomId: string,
  newPolygon: ReadonlyArray<Point>,
  floor: Floor
): {
  valid: boolean
  invalidDoors: Door[]
  message?: string
} {
  const doors = findDoorsForRoom(roomId, floor)
  
  if (doors.length === 0) {
    return { valid: true, invalidDoors: [] }
  }

  const invalidDoors: Door[] = []
  
  for (const door of doors) {
    if (!isDoorStillValid(door, roomId, newPolygon, floor)) {
      invalidDoors.push(door)
    }
  }

  if (invalidDoors.length > 0) {
    return {
      valid: false,
      invalidDoors,
      message: `Cette action invaliderait ${invalidDoors.length} porte(s). Supprimez d'abord les portes.`
    }
  }

  return { valid: true, invalidDoors: [] }
}

/**
 * Supprime automatiquement les portes invalides après modification d'une pièce
 */
export function removeInvalidDoors(
  roomId: string,
  newPolygon: ReadonlyArray<Point>,
  floor: Floor
): Floor {
  const validation = validateRoomMoveWithDoors(roomId, newPolygon, floor)
  
  if (validation.invalidDoors.length === 0) {
    return floor
  }

  // Filtrer les portes invalides
  const invalidDoorIds = new Set(validation.invalidDoors.map(d => d.id))
  const remainingDoors = floor.doors.filter(door => !invalidDoorIds.has(door.id))

  return {
    ...floor,
    doors: remainingDoors
  }
}

/**
 * Vérifie si la suppression d'une pièce nécessite de supprimer des portes
 */
export function getDoorsToDeleteWithRoom(roomId: string, floor: Floor): Door[] {
  return findDoorsForRoom(roomId, floor)
}
