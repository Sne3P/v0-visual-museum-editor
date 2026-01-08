/**
 * SERVICE PORTES
 * Gestion complète des portes : détection, création, validation
 */

import type { Point, Room, Door, Wall, Floor } from '@/core/entities'
import { v4 as uuidv4 } from 'uuid'
import { distance, distanceToSegment, isPointInPolygon, snapToGrid } from './geometry.service'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'

/**
 * Représente un segment de mur partagé entre deux pièces
 */
export interface SharedWallSegment {
  readonly room_a: string
  readonly room_b: string
  readonly segment: readonly [Point, Point]
  readonly isRoomBoundary: boolean  // true si fait partie du périmètre des rooms
  readonly wallId?: string  // ID du mur intérieur s'il existe
}

/**
 * Représente une position possible pour une porte
 */
export interface DoorPosition {
  readonly room_a: string
  readonly room_b: string
  readonly segment: readonly [Point, Point]
  readonly center: Point
  readonly normal: Point  // Vecteur normal au mur (pour orientation porte)
  readonly wallId?: string
}

/**
 * Trouve tous les segments de mur partagés entre deux pièces adjacentes
 */
export function findSharedWallSegments(floor: Floor): SharedWallSegment[] {
  const sharedSegments: SharedWallSegment[] = []
  const rooms = floor.rooms

  // Comparer chaque paire de pièces
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const roomA = rooms[i]
      const roomB = rooms[j]

      // Vérifier chaque segment de roomA contre chaque segment de roomB
      const sharedSegsAB = findSharedSegmentsBetweenRooms(roomA, roomB)
      sharedSegments.push(...sharedSegsAB)
    }
  }

  // Ajouter aussi les murs intérieurs qui séparent des pièces
  for (const wall of floor.walls) {
    const shared = findRoomsAdjacentToWall(wall, floor)
    if (shared) {
      sharedSegments.push({
        room_a: shared.room_a,
        room_b: shared.room_b,
        segment: wall.segment,
        isRoomBoundary: false,
        wallId: wall.id
      })
    }
  }

  return sharedSegments
}

/**
 * Trouve les segments partagés entre deux pièces spécifiques
 */
function findSharedSegmentsBetweenRooms(
  roomA: Room,
  roomB: Room
): SharedWallSegment[] {
  const shared: SharedWallSegment[] = []
  const TOLERANCE = 2 // pixels

  // Vérifier chaque edge de roomA
  for (let i = 0; i < roomA.polygon.length; i++) {
    const a1 = roomA.polygon[i]
    const a2 = roomA.polygon[(i + 1) % roomA.polygon.length]

    // Vérifier contre chaque edge de roomB
    for (let j = 0; j < roomB.polygon.length; j++) {
      const b1 = roomB.polygon[j]
      const b2 = roomB.polygon[(j + 1) % roomB.polygon.length]

      // Vérifier si les segments sont colinéaires et se chevauchent
      const overlap = findSegmentOverlap(a1, a2, b1, b2, TOLERANCE)
      if (overlap) {
        // Vérifier que c'est bien un mur partagé (opposé)
        // Les segments doivent être dans des directions opposées
        const vecA = { x: a2.x - a1.x, y: a2.y - a1.y }
        const vecB = { x: b2.x - b1.x, y: b2.y - b1.y }
        const dotProduct = vecA.x * vecB.x + vecA.y * vecB.y

        // Si dotProduct < 0, segments opposés = mur partagé
        if (dotProduct < 0) {
          shared.push({
            room_a: roomA.id,
            room_b: roomB.id,
            segment: overlap,
            isRoomBoundary: true
          })
        }
      }
    }
  }

  return shared
}

/**
 * Trouve le segment qui se chevauche entre deux segments colinéaires
 */
function findSegmentOverlap(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
  tolerance: number
): readonly [Point, Point] | null {
  // Vérifier colinéarité
  const cross1 = Math.abs(crossProduct(a1, a2, b1))
  const cross2 = Math.abs(crossProduct(a1, a2, b2))

  if (cross1 > tolerance || cross2 > tolerance) {
    return null
  }

  // Projeter sur l'axe du segment
  const dx = a2.x - a1.x
  const dy = a2.y - a1.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.01) return null

  const ux = dx / length
  const uy = dy / length

  // Projections
  const t_a1 = 0
  const t_a2 = length
  const t_b1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy
  const t_b2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy

  const t_b_min = Math.min(t_b1, t_b2)
  const t_b_max = Math.max(t_b1, t_b2)

  // Intersection des intervalles
  const overlap_start = Math.max(t_a1, t_b_min)
  const overlap_end = Math.min(t_a2, t_b_max)

  if (overlap_end - overlap_start < tolerance) {
    return null
  }

  // Reconstruire les points du segment qui chevauche
  const start: Point = {
    x: a1.x + ux * overlap_start,
    y: a1.y + uy * overlap_start
  }
  const end: Point = {
    x: a1.x + ux * overlap_end,
    y: a1.y + uy * overlap_end
  }

  return [start, end]
}

/**
 * Trouve les pièces adjacentes à un mur intérieur
 */
function findRoomsAdjacentToWall(
  wall: Wall,
  floor: Floor
): { room_a: string; room_b: string } | null {
  const adjacentRooms: string[] = []
  const midpoint = {
    x: (wall.segment[0].x + wall.segment[1].x) / 2,
    y: (wall.segment[0].y + wall.segment[1].y) / 2
  }

  // Calculer la normale au mur
  const dx = wall.segment[1].x - wall.segment[0].x
  const dy = wall.segment[1].y - wall.segment[0].y
  const length = Math.sqrt(dx * dx + dy * dy)
  
  if (length < 0.01) return null

  // Normale perpendiculaire (90°)
  const nx = -dy / length
  const ny = dx / length

  // Tester des points de chaque côté du mur
  const offset = GRID_SIZE * 0.5 // 0.5 unité de grille
  const side1 = { x: midpoint.x + nx * offset, y: midpoint.y + ny * offset }
  const side2 = { x: midpoint.x - nx * offset, y: midpoint.y - ny * offset }

  // Trouver les pièces contenant ces points
  for (const room of floor.rooms) {
    if (isPointInPolygon(side1, room.polygon)) {
      if (!adjacentRooms.includes(room.id)) adjacentRooms.push(room.id)
    }
    if (isPointInPolygon(side2, room.polygon)) {
      if (!adjacentRooms.includes(room.id)) adjacentRooms.push(room.id)
    }
  }

  if (adjacentRooms.length === 2) {
    return { room_a: adjacentRooms[0], room_b: adjacentRooms[1] }
  }

  return null
}

/**
 * Produit vectoriel pour tester colinéarité
 */
function crossProduct(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
}

/**
 * Trouve toutes les positions possibles pour placer des portes
 */
export function findPossibleDoorPositions(floor: Floor): DoorPosition[] {
  const sharedWalls = findSharedWallSegments(floor)
  const positions: DoorPosition[] = []

  for (const shared of sharedWalls) {
    const [start, end] = shared.segment
    const segmentLength = distance(start, end)

    // Minimum de longueur pour placer une porte
    const minDoorWidth = CONSTRAINTS.door.minWidth * GRID_SIZE
    if (segmentLength < minDoorWidth) continue

    // Centre du segment
    const center: Point = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    }

    // Calculer la normale
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const normal: Point = {
      x: -dy / length,
      y: dx / length
    }

    positions.push({
      room_a: shared.room_a,
      room_b: shared.room_b,
      segment: shared.segment,
      center: snapToGrid(center, GRID_SIZE),
      normal,
      wallId: shared.wallId
    })
  }

  return positions
}

/**
 * Crée une porte à une position donnée sur un mur partagé
 */
export function createDoor(
  position: Point,
  width: number,
  sharedWall: SharedWallSegment,
  floor: Floor
): Door | null {
  // Valider la largeur
  if (width < CONSTRAINTS.door.minWidth || width > CONSTRAINTS.door.maxWidth) {
    return null
  }

  // Trouver le point le plus proche sur le segment
  const [start, end] = sharedWall.segment
  const projectedPoint = projectPointOntoSegment(position, start, end)

  // Créer un segment de porte centré sur ce point
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.01) return null

  // Direction unitaire du mur
  const ux = dx / length
  const uy = dy / length

  // Demi-largeur de la porte (en pixels)
  const halfWidth = (width * GRID_SIZE) / 2

  // Points de début et fin de la porte EN UNITÉS DE GRILLE
  const doorStart: Point = {
    x: Math.round((projectedPoint.x - ux * halfWidth) / GRID_SIZE),
    y: Math.round((projectedPoint.y - uy * halfWidth) / GRID_SIZE)
  }

  const doorEnd: Point = {
    x: Math.round((projectedPoint.x + ux * halfWidth) / GRID_SIZE),
    y: Math.round((projectedPoint.y + uy * halfWidth) / GRID_SIZE)
  }

  // Vérifier que la porte reste dans le segment du mur
  if (!isPointOnSegment(doorStart, start, end) || !isPointOnSegment(doorEnd, start, end)) {
    return null
  }

  return {
    id: uuidv4(),
    room_a: sharedWall.room_a,
    room_b: sharedWall.room_b,
    segment: [doorStart, doorEnd],
    width,
    roomId: sharedWall.wallId // Lier au mur si c'est un mur intérieur
  }
}

/**
 * Projette un point sur un segment
 */
function projectPointOntoSegment(point: Point, segStart: Point, segEnd: Point): Point {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared < 0.0001) {
    return { ...segStart }
  }

  const t = Math.max(0, Math.min(1, 
    ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared
  ))

  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy
  }
}

/**
 * Vérifie si un point est sur un segment
 */
function isPointOnSegment(point: Point, segStart: Point, segEnd: Point): boolean {
  const dist = distanceToSegment(point, segStart, segEnd)
  return dist < 5 // Tolérance de 5 pixels
}

/**
 * Valide si une porte peut être placée à une position donnée
 */
export function validateDoorPlacement(
  door: Door,
  floor: Floor
): { valid: boolean; message?: string } {
  // Vérifier que les deux pièces existent
  const roomA = floor.rooms.find(r => r.id === door.room_a)
  const roomB = floor.rooms.find(r => r.id === door.room_b)

  if (!roomA || !roomB) {
    return { valid: false, message: "Les pièces spécifiées n'existent pas" }
  }

  // La largeur est stockée en mètres dans door.width
  // Vérifier directement cette valeur
  if (door.width < CONSTRAINTS.door.minWidth) {
    return { valid: false, message: `Largeur minimale: ${CONSTRAINTS.door.minWidth}m` }
  }

  if (door.width > CONSTRAINTS.door.maxWidth) {
    return { valid: false, message: `Largeur maximale: ${CONSTRAINTS.door.maxWidth}m` }
  }

  // Vérifier le chevauchement avec portes existantes
  const doorCenterGrid = {
    x: (door.segment[0].x + door.segment[1].x) / 2,
    y: (door.segment[0].y + door.segment[1].y) / 2
  }

  for (const existingDoor of floor.doors) {
    if (existingDoor.id === door.id) continue // Ignorer la porte elle-même

    const existingCenterGrid = {
      x: (existingDoor.segment[0].x + existingDoor.segment[1].x) / 2,
      y: (existingDoor.segment[0].y + existingDoor.segment[1].y) / 2
    }

    // Distance en pixels
    const distPixels = distance(doorCenterGrid, existingCenterGrid)
    
    // Vérifier chevauchement : somme des demi-largeurs en pixels (mètres * 80)
    const minDistPixels = (door.width + existingDoor.width) * 80 / 2
    
    if (distPixels < minDistPixels) {
      return { valid: false, message: "Chevauchement avec une autre porte" }
    }
  }

  // Vérifier que la porte est bien sur un mur partagé
  const sharedWalls = findSharedWallSegments(floor)
  
  // doorCenterGrid est déjà en pixels
  const doorCenterPixels = {
    x: doorCenterGrid.x,
    y: doorCenterGrid.y
  }
  
  const isOnSharedWall = sharedWalls.some(wall => {
    const dist = distanceToSegment(doorCenterPixels, wall.segment[0], wall.segment[1])
    return dist < 20 // Tolérance de 20 pixels
  })

  if (!isOnSharedWall) {
    return { valid: false, message: "La porte doit être sur un mur partagé" }
  }

  return { valid: true }
}

/**
 * Trouve toutes les connexions entre pièces via les portes
 */
export function findRoomConnections(floor: Floor): Map<string, Set<string>> {
  const connections = new Map<string, Set<string>>()

  // Initialiser
  for (const room of floor.rooms) {
    connections.set(room.id, new Set())
  }

  // Ajouter les connexions via portes
  for (const door of floor.doors) {
    const setA = connections.get(door.room_a)
    const setB = connections.get(door.room_b)

    if (setA && setB) {
      setA.add(door.room_b)
      setB.add(door.room_a)
    }
  }

  return connections
}

/**
 * Vérifie si deux pièces sont connectées (directement ou indirectement)
 */
export function areRoomsConnected(
  roomA: string,
  roomB: string,
  floor: Floor
): boolean {
  const connections = findRoomConnections(floor)
  const visited = new Set<string>()
  const queue = [roomA]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === roomB) return true
    if (visited.has(current)) continue

    visited.add(current)
    const neighbors = connections.get(current)
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor)
        }
      }
    }
  }

  return false
}

/**
 * Valider le déplacement d'une porte
 * La porte doit rester sur un segment de mur partagé valide
 */
export function validateDoorMove(
  door: Door,
  floor: Floor
): { valid: boolean; message?: string } {
  // Trouver tous les segments de mur partagés
  const sharedSegments = findSharedWallSegments(floor)
  
  // Vérifier si la porte est toujours sur un segment partagé valide
  const doorCenter = {
    x: (door.segment[0].x + door.segment[1].x) / 2,
    y: (door.segment[0].y + door.segment[1].y) / 2
  }
  
  // Chercher un segment partagé qui contient la porte
  let foundValidSegment = false
  for (const segment of sharedSegments) {
    // Vérifier si la porte est sur ce segment
    const segStart = segment.segment[0]
    const segEnd = segment.segment[1]
    
    // Tout est déjà en pixels
    
    // Vérifier si le centre de la porte est sur ce segment
    const dist = distanceToSegment(
      { x: doorCenter.x, y: doorCenter.y },
      segStart,
      segEnd
    )
    
    if (dist < 5) { // Tolérance 5 pixels
      // Vérifier que les deux points de la porte sont aussi sur le segment
      const dist1 = distanceToSegment(
        { x: door.segment[0].x, y: door.segment[0].y },
        segStart,
        segEnd
      )
      const dist2 = distanceToSegment(
        { x: door.segment[1].x, y: door.segment[1].y },
        segStart,
        segEnd
      )
      
      if (dist1 < 5 && dist2 < 5) {
        foundValidSegment = true
        break
      }
    }
  }
  
  if (!foundValidSegment) {
    return {
      valid: false,
      message: 'La porte doit rester sur un mur partagé'
    }
  }
  
  // Vérifier la largeur
  const doorWidth = Math.sqrt(
    Math.pow(door.segment[1].x - door.segment[0].x, 2) +
    Math.pow(door.segment[1].y - door.segment[0].y, 2)
  )
  
  const doorWidthMeters = doorWidth * GRID_SIZE / 100
  
  if (doorWidthMeters < CONSTRAINTS.door.minWidth) {
    return {
      valid: false,
      message: `Porte trop petite (min: ${CONSTRAINTS.door.minWidth}m)`
    }
  }
  
  if (doorWidthMeters > CONSTRAINTS.door.maxWidth) {
    return {
      valid: false,
      message: `Porte trop large (max: ${CONSTRAINTS.door.maxWidth}m)`
    }
  }
  
  return { valid: true }
}
