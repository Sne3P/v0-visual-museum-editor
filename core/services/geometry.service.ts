/**
 * SERVICE GÉOMÉTRIE - VERSION CONSOLIDÉE
 * Toutes les fonctions géométriques en un seul endroit
 */

import type { Point, Bounds } from '@/core/entities'
import { GRID_SIZE, SNAP_THRESHOLD, GRID_TO_METERS, MEASUREMENT_PRECISION, GEOMETRY } from '@/core/constants'

// Ancien alias pour compatibilité (utilise polygonsOverlap maintenant)
export { polygonsOverlap as polygonsIntersect }

/**
 * Snap un point à la grille
 */
export function snapToGrid(point: Point, gridSize: number = GRID_SIZE): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  }
}

/**
 * Test point dans polygone (winding number algorithm)
 */
export function isPointInPolygon(point: Point, polygon: ReadonlyArray<Point>): boolean {
  if (polygon.length < 3) return false
  
  let windingNumber = 0
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]
    const p2 = polygon[(i + 1) % polygon.length]
    
    if (p1.y <= point.y) {
      if (p2.y > point.y) {
        if (isLeft(p1, p2, point) > 0) {
          windingNumber++
        }
      }
    } else {
      if (p2.y <= point.y) {
        if (isLeft(p1, p2, point) < 0) {
          windingNumber--
        }
      }
    }
  }
  
  return windingNumber !== 0
}

function isLeft(p0: Point, p1: Point, p2: Point): number {
  return (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)
}

/**
 * Calcule les limites d'un ensemble de points
 */
export function calculateBounds(points: ReadonlyArray<Point>): Bounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  
  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y
  
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  
  return { minX, minY, maxX, maxY }
}

/**
 * Calcule la distance entre deux points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calcule la distance d'un point à un segment
 */
export function distanceToSegment(point: Point, segStart: Point, segEnd: Point): number {
  const projected = projectPointOntoSegment(point, segStart, segEnd)
  return distance(point, projected)
}

/**
 * Vérifie si deux polygones se chevauchent (surfaces internes)
 * Retourne true SEULEMENT si les surfaces internes se chevauchent
 * Retourne false si les polygones se touchent uniquement (arêtes communes ou points communs)
 */
export function polygonsOverlap(poly1: ReadonlyArray<Point>, poly2: ReadonlyArray<Point>): boolean {
  // 0. NOUVEAU: Détecter superposition complète ou partielle de segments
  // Si deux polygones ont des segments colinéaires qui se chevauchent, c'est un overlap
  for (let i = 0; i < poly1.length; i++) {
    const a1 = poly1[i]
    const a2 = poly1[(i + 1) % poly1.length]
    
    for (let j = 0; j < poly2.length; j++) {
      const b1 = poly2[j]
      const b2 = poly2[(j + 1) % poly2.length]
      
      // Vérifier si les segments sont colinéaires et se chevauchent
      if (segmentsAreCollinearAndOverlap(a1, a2, b1, b2)) {
        return true
      }
    }
  }
  
  // 1. Vérifier si des sommets de poly1 sont strictement à l'intérieur de poly2
  for (const vertex of poly1) {
    if (isPointStrictlyInsidePolygon(vertex, poly2)) {
      return true
    }
  }
  
  // 2. Vérifier si des sommets de poly2 sont strictement à l'intérieur de poly1
  for (const vertex of poly2) {
    if (isPointStrictlyInsidePolygon(vertex, poly1)) {
      return true
    }
  }
  
  // 3. Vérifier les intersections d'arêtes (non aux extrémités)
  for (let i = 0; i < poly1.length; i++) {
    const a1 = poly1[i]
    const a2 = poly1[(i + 1) % poly1.length]
    
    for (let j = 0; j < poly2.length; j++) {
      const b1 = poly2[j]
      const b2 = poly2[(j + 1) % poly2.length]
      
      // Vérifier intersection au milieu des segments (pas aux extrémités)
      if (segmentsCrossInMiddle(a1, a2, b1, b2)) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Vérifie si deux segments sont colinéaires et se SUPERPOSENT (même direction)
 * Cas critique: deux pièces identiques superposées
 * 
 * IMPORTANT: Distingue contact externe (opposé) vs superposition (même direction)
 * - Contact externe: segments dans directions opposées = AUTORISÉ
 * - Superposition: segments dans même direction = INTERDIT
 */
function segmentsAreCollinearAndOverlap(a1: Point, a2: Point, b1: Point, b2: Point, tolerance: number = 1.0): boolean {
  // Vérifier si les 4 points sont colinéaires
  const crossProduct1 = Math.abs(crossProduct(a1, a2, b1))
  const crossProduct2 = Math.abs(crossProduct(a1, a2, b2))
  
  // Si pas colinéaires, pas de chevauchement
  if (crossProduct1 > tolerance || crossProduct2 > tolerance) {
    return false
  }
  
  // Les segments sont colinéaires, vérifier s'ils se chevauchent
  // Projeter tous les points sur l'axe du segment a1-a2
  const dx = a2.x - a1.x
  const dy = a2.y - a1.y
  const length = Math.sqrt(dx * dx + dy * dy)
  
  if (length < 0.01) return false // Segment dégénéré
  
  // Normaliser le vecteur direction
  const ux = dx / length
  const uy = dy / length
  
  // Projeter les points sur l'axe
  const t_a1 = 0
  const t_a2 = length
  const t_b1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy
  const t_b2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy
  
  // Ordonner les projections de b1 et b2
  const t_b_min = Math.min(t_b1, t_b2)
  const t_b_max = Math.max(t_b1, t_b2)
  
  // Vérifier chevauchement des intervalles [0, length] et [t_b_min, t_b_max]
  const overlap_start = Math.max(t_a1, t_b_min)
  const overlap_end = Math.min(t_a2, t_b_max)
  
  // Pas de chevauchement si intersection trop petite
  if ((overlap_end - overlap_start) <= tolerance) {
    return false
  }
  
  // ✅ NOUVEAU: Vérifier l'ORIENTATION des segments
  // Si segments dans directions opposées = contact externe (AUTORISÉ)
  // Si segments dans même direction = superposition (INTERDIT)
  
  const vec_a = { x: a2.x - a1.x, y: a2.y - a1.y }
  const vec_b = { x: b2.x - b1.x, y: b2.y - b1.y }
  
  // Produit scalaire: positif = même direction, négatif = opposé
  const dotProduct = vec_a.x * vec_b.x + vec_a.y * vec_b.y
  
  // Si même direction (dotProduct > 0) = SUPERPOSITION
  // Si direction opposée (dotProduct < 0) = CONTACT EXTERNE (autorisé)
  return dotProduct > 0
}

/**
 * Produit vectoriel pour détecter colinéarité
 */
function crossProduct(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
}

/**
 * Vérifie si un point est STRICTEMENT à l'intérieur d'un polygone
 * (pas sur les bords)
 */
function isPointStrictlyInsidePolygon(point: Point, polygon: ReadonlyArray<Point>): boolean {
  if (!isPointInPolygon(point, polygon)) return false
  
  // Vérifier que le point n'est pas sur un bord
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]
    const p2 = polygon[(i + 1) % polygon.length]
    
    if (isPointOnSegment(point, p1, p2)) {
      return false
    }
  }
  
  return true
}

/**
 * Vérifie si un point est sur un segment
 */
function isPointOnSegment(point: Point, segStart: Point, segEnd: Point, tolerance: number = 0.01): boolean {
  const dist = distanceToSegment(point, segStart, segEnd)
  return dist < tolerance
}

/**
 * Vérifie si deux segments se croisent au milieu (pas aux extrémités)
 */
function segmentsCrossInMiddle(a1: Point, a2: Point, b1: Point, b2: Point, tolerance: number = 0.01): boolean {
  const intersection = getSegmentIntersection(a1, a2, b1, b2)
  if (!intersection) return false
  
  // Vérifier que l'intersection n'est pas aux extrémités
  const isEndpoint = 
    distance(intersection, a1) < tolerance ||
    distance(intersection, a2) < tolerance ||
    distance(intersection, b1) < tolerance ||
    distance(intersection, b2) < tolerance
  
  return !isEndpoint
}

/**
 * Calcule le point d'intersection entre deux segments (si existe)
 */
function getSegmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  
  const denominator = dax * dby - day * dbx
  if (Math.abs(denominator) < 1e-10) return null // Parallèles
  
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denominator
  const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denominator
  
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a1.x + t * dax,
      y: a1.y + t * day
    }
  }
  
  return null
}

/**
 * Projette un point sur un segment
 */
export function projectPointOntoSegment(point: Point, segStart: Point, segEnd: Point): Point {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  
  if (dx === 0 && dy === 0) return segStart
  
  const t = Math.max(0, Math.min(1, 
    ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / (dx * dx + dy * dy)
  ))
  
  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  }
}

/**
 * Vérifie si deux segments se croisent
 */
export function segmentsIntersect(
  seg1: readonly [Point, Point],
  seg2: readonly [Point, Point]
): boolean {
  const [p1, p2] = seg1
  const [p3, p4] = seg2
  
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  
  return false
}

function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.y - p1.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p3.x - p1.x)
}

/**
 * Calcule l'aire d'un polygone en mètres carrés
 */
export function calculatePolygonAreaInMeters(polygon: ReadonlyArray<Point>): number {
  if (polygon.length < 3) return 0
  
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].x * polygon[j].y
    area -= polygon[j].x * polygon[i].y
  }
  
  area = Math.abs(area) / 2
  
  // Convertir en m² (grille → mètres)
  const gridToMeters = GRID_TO_METERS
  return Number((area * gridToMeters * gridToMeters).toFixed(MEASUREMENT_PRECISION))
}

/**
 * Calcule le centre d'un polygone
 */
export function getPolygonCenter(polygon: ReadonlyArray<Point>): Point {
  if (polygon.length === 0) return { x: 0, y: 0 }
  
  let sumX = 0
  let sumY = 0
  
  for (const point of polygon) {
    sumX += point.x
    sumY += point.y
  }
  
  return {
    x: sumX / polygon.length,
    y: sumY / polygon.length,
  }
}

/**
 * Calcule le milieu d'un segment
 */
export function getSegmentMidpoint(start: Point, end: Point): Point {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

/**
 * Calcule la distance en mètres
 */
export function calculateDistanceInMeters(p1: Point, p2: Point): number {
  const dist = distance(p1, p2)
  return Number((dist * GRID_TO_METERS).toFixed(MEASUREMENT_PRECISION))
}

/**
 * Crée un polygone circulaire avec points snappés au grid
 */
export function createCirclePolygon(center: Point, radius: number, gridSize: number = GRID_SIZE): Point[] {
  const points: Point[] = []
  const segments = GEOMETRY.circleSegments
  
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const point = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }
    // Snapper chaque point au grid
    points.push(snapToGrid(point, gridSize))
  }
  
  return points
}

/**
 * Crée un polygone triangulaire avec points snappés au grid
 */
export function createTrianglePolygon(p1: Point, p2: Point, gridSize: number = GRID_SIZE): Point[] {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const height = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)
  
  const points = [
    p1,
    p2,
    {
      x: p1.x + Math.cos(angle + Math.PI / 3) * height,
      y: p1.y + Math.sin(angle + Math.PI / 3) * height,
    },
  ]
  
  // Snapper tous les points au grid
  return points.map(p => snapToGrid(p, gridSize))
}

/**
 * Crée un polygone d'arc avec points snappés au grid
 * Version améliorée : calcule automatiquement le meilleur arc (petit ou grand) selon la position du drag
 * 
 * @param start - Point de départ du drag (centre de l'arc)
 * @param dragPoint - Point actuel du drag (détermine rayon et direction)
 * @param gridSize - Taille de la grille pour le snap
 * @returns Polygone représentant l'arc (centre + points de l'arc)
 */
export function createArcPolygon(start: Point, dragPoint: Point, gridSize: number = GRID_SIZE): Point[] {
  // Le rayon est la distance entre start et dragPoint
  const radius = distance(start, dragPoint)
  
  // L'angle du drag détermine la direction de l'arc
  const dragAngle = Math.atan2(dragPoint.y - start.y, dragPoint.x - start.x)
  
  // Arc de 180° (demi-cercle)
  // On détermine si c'est un arc "vers le haut" ou "vers le bas" selon la position du drag
  const arcSpan = Math.PI // 180 degrés
  
  // Si on drag vers le haut (dy < 0), arc vers le haut
  // Si on drag vers le bas (dy > 0), arc vers le bas
  // L'arc commence perpendiculairement à la direction du drag
  const startAngle = dragAngle - arcSpan / 2
  const endAngle = dragAngle + arcSpan / 2
  
  const points: Point[] = [snapToGrid(start, gridSize)]
  const segments = GEOMETRY.arcSegments
  
  for (let i = 0; i <= segments; i++) {
    const currentAngle = startAngle + (i / segments) * arcSpan
    const point = {
      x: start.x + Math.cos(currentAngle) * radius,
      y: start.y + Math.sin(currentAngle) * radius,
    }
    // Snapper chaque point au grid
    points.push(snapToGrid(point, gridSize))
  }
  
  return points
}

/**
 * Obtient la direction perpendiculaire à un segment
 */
export function getPerpendicularDirection(start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.sqrt(dx * dx + dy * dy)
  
  if (length === 0) return { x: 0, y: 1 }
  
  return {
    x: -dy / length,
    y: dx / length,
  }
}
