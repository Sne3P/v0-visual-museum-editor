/**
 * Système de gestion des murs pour l'éditeur de plan de musée
 * Gère la création, placement et contraintes des murs intérieurs
 */

import type { Point, Wall, Room, Floor } from './types'
import { GRID_SIZE } from './constants'
import { v4 as uuidv4 } from 'uuid'

// Épaisseur standard des murs (en unités de grille)
export const WALL_THICKNESS = {
  INTERIOR: 0.15,    // Murs intérieurs fins
  EXTERIOR: 0.25,    // Murs extérieurs plus épais
  LOAD_BEARING: 0.3  // Murs porteurs
}

// Crée un nouveau mur
export function createWall(
  start: Point,
  end: Point,
  thickness: number = WALL_THICKNESS.INTERIOR,
  roomId?: string,
  isLoadBearing: boolean = false
): Wall {
  return {
    id: uuidv4(),
    segment: [start, end],
    thickness,
    roomId,
    isLoadBearing
  }
}

// Trouve la pièce qui contient un point
export function findRoomContainingPoint(point: Point, floor: Floor): Room | null {
  return floor.rooms.find(room => isPointInPolygon(point, room.polygon)) || null
}

// Vérifie si un point est dans un polygone (ray casting algorithm)
function isPointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false
  
  let inside = false
  const { x, y } = point
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  
  return inside
}

// Trouve tous les murs qui intersectent avec un segment
export function findIntersectingWalls(
  segment: readonly [Point, Point],
  walls: readonly Wall[]
): Wall[] {
  return walls.filter(wall => segmentsIntersect(segment, wall.segment))
}

// Vérifie si deux segments se croisent
function segmentsIntersect(
  seg1: readonly [Point, Point],
  seg2: readonly [Point, Point]
): boolean {
  const [p1, p2] = seg1
  const [p3, p4] = seg2
  
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y)
}

// Valide qu'un mur peut être placé
export function validateWallPlacement(
  wall: Wall,
  floor: Floor
): { valid: boolean; message?: string } {
  // Vérifier la longueur minimale
  const length = Math.hypot(
    wall.segment[1].x - wall.segment[0].x,
    wall.segment[1].y - wall.segment[0].y
  )
  
  if (length < 0.5) {
    return { valid: false, message: "Le mur est trop court (minimum 0.5 unités)" }
  }
  
  // Vérifier que le mur est dans une pièce si roomId est spécifié
  if (wall.roomId) {
    const room = floor.rooms.find(r => r.id === wall.roomId)
    if (!room) {
      return { valid: false, message: "Pièce introuvable" }
    }
    
    const midPoint = {
      x: (wall.segment[0].x + wall.segment[1].x) / 2,
      y: (wall.segment[0].y + wall.segment[1].y) / 2
    }
    
    if (!isPointInPolygon(midPoint, room.polygon)) {
      return { valid: false, message: "Le mur doit être à l'intérieur de la pièce" }
    }
  }
  
  return { valid: true }
}

// Trouve les points d'accrochage le long des murs existants
export function findWallSnapPoints(
  point: Point,
  walls: readonly Wall[],
  snapDistance: number = 0.3
): Point[] {
  const snapPoints: Point[] = []
  
  walls.forEach(wall => {
    // Points de début et fin
    const startDist = Math.hypot(point.x - wall.segment[0].x, point.y - wall.segment[0].y)
    const endDist = Math.hypot(point.x - wall.segment[1].x, point.y - wall.segment[1].y)
    
    if (startDist <= snapDistance) {
      snapPoints.push(wall.segment[0])
    }
    if (endDist <= snapDistance) {
      snapPoints.push(wall.segment[1])
    }
    
    // Point le plus proche sur le segment
    const closestPoint = getClosestPointOnSegment(point, wall.segment[0], wall.segment[1])
    const distToSegment = Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y)
    
    if (distToSegment <= snapDistance) {
      snapPoints.push(closestPoint)
    }
  })
  
  return snapPoints
}

// Trouve le point le plus proche sur un segment
function getClosestPointOnSegment(point: Point, segStart: Point, segEnd: Point): Point {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  const length = Math.hypot(dx, dy)
  
  if (length === 0) return segStart
  
  const t = Math.max(0, Math.min(1, 
    ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / (length * length)
  ))
  
  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy
  }
}

// Génère automatiquement des murs pour diviser une pièce
export function generateRoomDivision(
  room: Room,
  divisionType: 'horizontal' | 'vertical' | 'cross'
): Wall[] {
  const bounds = getRoomBounds(room)
  const walls: Wall[] = []
  
  switch (divisionType) {
    case 'horizontal':
      const midY = (bounds.minY + bounds.maxY) / 2
      walls.push(createWall(
        { x: bounds.minX, y: midY },
        { x: bounds.maxX, y: midY },
        WALL_THICKNESS.INTERIOR,
        room.id
      ))
      break
      
    case 'vertical':
      const midX = (bounds.minX + bounds.maxX) / 2
      walls.push(createWall(
        { x: midX, y: bounds.minY },
        { x: midX, y: bounds.maxY },
        WALL_THICKNESS.INTERIOR,
        room.id
      ))
      break
      
    case 'cross':
      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerY = (bounds.minY + bounds.maxY) / 2
      
      walls.push(
        createWall(
          { x: bounds.minX, y: centerY },
          { x: bounds.maxX, y: centerY },
          WALL_THICKNESS.INTERIOR,
          room.id
        ),
        createWall(
          { x: centerX, y: bounds.minY },
          { x: centerX, y: bounds.maxY },
          WALL_THICKNESS.INTERIOR,
          room.id
        )
      )
      break
  }
  
  return walls
}

// Calcule les limites d'une pièce
function getRoomBounds(room: Room): { minX: number; minY: number; maxX: number; maxY: number } {
  if (room.polygon.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  
  let minX = room.polygon[0].x
  let maxX = room.polygon[0].x
  let minY = room.polygon[0].y
  let maxY = room.polygon[0].y
  
  room.polygon.forEach(point => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  })
  
  return { minX, minY, maxX, maxY }
}