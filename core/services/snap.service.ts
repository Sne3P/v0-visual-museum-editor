/**
 * Service de snap intelligent pour CAO professionnel
 * - Snap sur grille
 * - Snap sur points existants (sommets de pièces, murs, etc.)
 * - Snap sur segments (milieux, projections)
 * - Priorités de snap configurables
 */

import type { Point, Floor, Room, Wall } from '@/core/entities'
import { snapToGrid, distance, projectPointOntoSegment } from '@/core/services'
import { GRID_SIZE, SNAP_THRESHOLD } from '@/core/constants'

export interface SnapResult {
  point: Point
  snapped: boolean
  snapType: 'grid' | 'vertex' | 'edge' | 'midpoint' | 'none'
  targetElement?: {
    type: 'room' | 'wall' | 'artwork'
    id: string
  }
}

interface SnapOptions {
  enableGrid?: boolean
  enableVertices?: boolean
  enableEdges?: boolean
  enableMidpoints?: boolean
  snapDistance?: number // Distance maximale pour snap (en pixels monde)
}

const DEFAULT_SNAP_OPTIONS: SnapOptions = {
  enableGrid: true,
  enableVertices: true,
  enableEdges: true,
  enableMidpoints: false,
  snapDistance: GRID_SIZE * 0.5 // Moitié d'une cellule de grille
}

/**
 * Snap intelligent avec priorités :
 * 1. Points existants (sommets)
 * 2. Bords existants (projection sur segments)
 * 3. Milieux de segments
 * 4. Grille
 */
export function smartSnap(
  point: Point,
  floor: Floor,
  options: SnapOptions = {}
): SnapResult {
  const opts = { ...DEFAULT_SNAP_OPTIONS, ...options }
  const snapDistSq = opts.snapDistance! * opts.snapDistance!

  // 1. Essayer de snap sur les sommets existants
  if (opts.enableVertices) {
    const vertexSnap = snapToVertices(point, floor, snapDistSq)
    if (vertexSnap) return vertexSnap
  }

  // 2. Essayer de snap sur les bords existants
  if (opts.enableEdges) {
    const edgeSnap = snapToEdges(point, floor, snapDistSq)
    if (edgeSnap) return edgeSnap
  }

  // 3. Essayer de snap sur les milieux de segments
  if (opts.enableMidpoints) {
    const midpointSnap = snapToMidpoints(point, floor, snapDistSq)
    if (midpointSnap) return midpointSnap
  }

  // 4. Par défaut, snap sur la grille
  if (opts.enableGrid) {
    return {
      point: snapToGrid(point, GRID_SIZE),
      snapped: true,
      snapType: 'grid'
    }
  }

  // 5. Aucun snap
  return {
    point,
    snapped: false,
    snapType: 'none'
  }
}

/**
 * Snap sur les sommets de toutes les pièces et murs
 */
function snapToVertices(point: Point, floor: Floor, snapDistSq: number): SnapResult | null {
  let closestPoint: Point | null = null
  let closestDistSq = snapDistSq
  let targetElement: { type: 'room' | 'wall', id: string } | undefined

  // Vérifier tous les sommets des pièces
  for (const room of floor.rooms) {
    for (const vertex of room.polygon) {
      const distSq = distanceSquared(point, vertex)
      if (distSq < closestDistSq) {
        closestDistSq = distSq
        closestPoint = vertex
        targetElement = { type: 'room', id: room.id }
      }
    }
  }

  // Vérifier les extrémités des murs
  for (const wall of floor.walls || []) {
    for (const vertex of wall.segment) {
      const distSq = distanceSquared(point, vertex)
      if (distSq < closestDistSq) {
        closestDistSq = distSq
        closestPoint = vertex
        targetElement = { type: 'wall', id: wall.id }
      }
    }
  }

  if (closestPoint) {
    return {
      point: closestPoint,
      snapped: true,
      snapType: 'vertex',
      targetElement
    }
  }

  return null
}

/**
 * Snap sur les bords (projection sur segments)
 */
function snapToEdges(point: Point, floor: Floor, snapDistSq: number): SnapResult | null {
  let closestPoint: Point | null = null
  let closestDistSq = snapDistSq
  let targetElement: { type: 'room' | 'wall', id: string } | undefined

  // Vérifier tous les segments des pièces
  for (const room of floor.rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const v1 = room.polygon[i]
      const v2 = room.polygon[(i + 1) % room.polygon.length]
      
      const projected = projectPointOntoSegment(point, v1, v2)
      const distSq = distanceSquared(point, projected)
      
      // Vérifier que la projection est bien sur le segment (pas au-delà)
      if (isPointOnSegment(projected, v1, v2) && distSq < closestDistSq) {
        closestDistSq = distSq
        closestPoint = projected
        targetElement = { type: 'room', id: room.id }
      }
    }
  }

  // Vérifier les murs
  for (const wall of floor.walls || []) {
    const projected = projectPointOntoSegment(point, wall.segment[0], wall.segment[1])
    const distSq = distanceSquared(point, projected)
    
    if (isPointOnSegment(projected, wall.segment[0], wall.segment[1]) && distSq < closestDistSq) {
      closestDistSq = distSq
      closestPoint = projected
      targetElement = { type: 'wall', id: wall.id }
    }
  }

  if (closestPoint) {
    // Snap le point projeté sur la grille pour un résultat propre
    return {
      point: snapToGrid(closestPoint, GRID_SIZE),
      snapped: true,
      snapType: 'edge',
      targetElement
    }
  }

  return null
}

/**
 * Snap sur les milieux de segments
 */
function snapToMidpoints(point: Point, floor: Floor, snapDistSq: number): SnapResult | null {
  let closestPoint: Point | null = null
  let closestDistSq = snapDistSq
  let targetElement: { type: 'room' | 'wall', id: string } | undefined

  // Vérifier les milieux des segments des pièces
  for (const room of floor.rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const v1 = room.polygon[i]
      const v2 = room.polygon[(i + 1) % room.polygon.length]
      const midpoint = {
        x: (v1.x + v2.x) / 2,
        y: (v1.y + v2.y) / 2
      }
      
      const distSq = distanceSquared(point, midpoint)
      if (distSq < closestDistSq) {
        closestDistSq = distSq
        closestPoint = midpoint
        targetElement = { type: 'room', id: room.id }
      }
    }
  }

  // Vérifier les milieux des murs
  for (const wall of floor.walls || []) {
    const midpoint = {
      x: (wall.segment[0].x + wall.segment[1].x) / 2,
      y: (wall.segment[0].y + wall.segment[1].y) / 2
    }
    
    const distSq = distanceSquared(point, midpoint)
    if (distSq < closestDistSq) {
      closestDistSq = distSq
      closestPoint = midpoint
      targetElement = { type: 'wall', id: wall.id }
    }
  }

  if (closestPoint) {
    return {
      point: snapToGrid(closestPoint, GRID_SIZE),
      snapped: true,
      snapType: 'midpoint',
      targetElement
    }
  }

  return null
}

/**
 * Distance au carré (plus rapide que distance réelle)
 */
function distanceSquared(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return dx * dx + dy * dy
}

/**
 * Vérifie si un point est sur un segment (entre les extrémités)
 */
function isPointOnSegment(point: Point, segStart: Point, segEnd: Point, tolerance: number = 0.01): boolean {
  const distToStart = distance(point, segStart)
  const distToEnd = distance(point, segEnd)
  const segLength = distance(segStart, segEnd)
  
  // Le point est sur le segment si la somme des distances aux extrémités
  // est approximativement égale à la longueur du segment
  return Math.abs(distToStart + distToEnd - segLength) < tolerance
}

/**
 * Récupère tous les points de snap disponibles (pour affichage visuel)
 */
export function getAllSnapPoints(floor: Floor): Array<{ point: Point, type: 'vertex' | 'midpoint' }> {
  const snapPoints: Array<{ point: Point, type: 'vertex' | 'midpoint' }> = []

  // Sommets des pièces
  for (const room of floor.rooms) {
    for (const vertex of room.polygon) {
      snapPoints.push({ point: vertex, type: 'vertex' })
    }
  }

  // Extrémités des murs
  for (const wall of floor.walls || []) {
    for (const vertex of wall.segment) {
      snapPoints.push({ point: vertex, type: 'vertex' })
    }
  }

  return snapPoints
}
