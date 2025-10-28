/**
 * Système de snap intelligent pour l'éditeur de plan de musée
 * Gère le snap entre éléments, contraintes géométriques et alignements
 */

import type { Point, Room, Wall, Door, VerticalLink, Floor } from './types'
import { GRID_SIZE } from './constants'

export interface SnapPoint {
  readonly point: Point
  readonly type: 'vertex' | 'wall' | 'grid' | 'perpendicular' | 'parallel'
  readonly elementId?: string
  readonly priority: number // Plus élevé = plus prioritaire
  readonly distance: number
}

export interface SnapResult {
  readonly snappedPoint: Point
  readonly snapPoints: readonly SnapPoint[]
  readonly hasSnap: boolean
}

// Trouve tous les points de snap disponibles
export function findSnapPoints(
  targetPoint: Point,
  floor: Floor,
  maxDistance: number = 0.5 // En unités de grille
): SnapPoint[] {
  const snapPoints: SnapPoint[] = []
  
  // Snap à la grille (priorité faible)
  const gridX = Math.round(targetPoint.x)
  const gridY = Math.round(targetPoint.y)
  const gridDistance = Math.hypot(targetPoint.x - gridX, targetPoint.y - gridY)
  if (gridDistance <= maxDistance) {
    snapPoints.push({
      point: { x: gridX, y: gridY },
      type: 'grid',
      priority: 1,
      distance: gridDistance
    })
  }

  // Snap aux vertices des pièces (priorité haute)
  floor.rooms.forEach(room => {
    room.polygon.forEach(vertex => {
      const distance = Math.hypot(targetPoint.x - vertex.x, targetPoint.y - vertex.y)
      if (distance <= maxDistance) {
        snapPoints.push({
          point: vertex,
          type: 'vertex',
          elementId: room.id,
          priority: 10,
          distance
        })
      }
    })
  })

  // Snap aux murs (priorité moyenne)
  floor.walls.forEach(wall => {
    const snapToWall = snapPointToLineSegment(targetPoint, wall.segment[0], wall.segment[1])
    const distance = Math.hypot(targetPoint.x - snapToWall.x, targetPoint.y - snapToWall.y)
    if (distance <= maxDistance) {
      snapPoints.push({
        point: snapToWall,
        type: 'wall',
        elementId: wall.id,
        priority: 5,
        distance
      })
    }
  })

  // Trier par priorité puis par distance
  return snapPoints.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return a.distance - b.distance
  })
}

// Snap un point à un segment de ligne
export function snapPointToLineSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  
  if (length === 0) return start
  
  const t = Math.max(0, Math.min(1, 
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length)
  ))
  
  return {
    x: start.x + t * dx,
    y: start.y + t * dy
  }
}

// Trouve le meilleur point de snap
export function getBestSnapPoint(
  targetPoint: Point,
  floor: Floor,
  maxDistance: number = 0.5
): SnapResult {
  const snapPoints = findSnapPoints(targetPoint, floor, maxDistance)
  
  if (snapPoints.length === 0) {
    return {
      snappedPoint: targetPoint,
      snapPoints: [],
      hasSnap: false
    }
  }
  
  return {
    snappedPoint: snapPoints[0].point,
    snapPoints,
    hasSnap: true
  }
}

// Contraintes d'angle pour la rotation
export const ANGLE_CONSTRAINTS = {
  SNAP_ANGLE: 15, // Snap tous les 15 degrés
  RIGHT_ANGLE: 90,
  STRAIGHT_ANGLE: 180,
  TOLERANCE: 5 // Tolérance en degrés pour le snap d'angle
}

// Snap un angle aux contraintes
export function snapAngle(angle: number): number {
  const { SNAP_ANGLE, TOLERANCE } = ANGLE_CONSTRAINTS
  
  // Normaliser l'angle entre 0 et 360
  const normalizedAngle = ((angle % 360) + 360) % 360
  
  // Trouver l'angle de snap le plus proche
  const snapTarget = Math.round(normalizedAngle / SNAP_ANGLE) * SNAP_ANGLE
  const difference = Math.abs(normalizedAngle - snapTarget)
  
  if (difference <= TOLERANCE) {
    return snapTarget
  }
  
  return normalizedAngle
}

// Vérifie si deux murs sont parallèles
export function areWallsParallel(wall1: Wall, wall2: Wall, tolerance: number = 5): boolean {
  const angle1 = getWallAngle(wall1)
  const angle2 = getWallAngle(wall2)
  
  const diff = Math.abs(angle1 - angle2)
  return diff <= tolerance || diff >= (180 - tolerance)
}

// Obtient l'angle d'un mur en degrés
export function getWallAngle(wall: Wall): number {
  const dx = wall.segment[1].x - wall.segment[0].x
  const dy = wall.segment[1].y - wall.segment[0].y
  return Math.atan2(dy, dx) * 180 / Math.PI
}

// Vérifie si deux murs sont perpendiculaires
export function areWallsPerpendicular(wall1: Wall, wall2: Wall, tolerance: number = 5): boolean {
  const angle1 = getWallAngle(wall1)
  const angle2 = getWallAngle(wall2)
  
  const diff = Math.abs(angle1 - angle2)
  return Math.abs(diff - 90) <= tolerance || Math.abs(diff - 270) <= tolerance
}