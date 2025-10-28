/**
 * Système de placement intelligent d'œuvres d'art le long des murs
 * Gère l'alignement automatique et les contraintes architecturales
 */

import type { Point, Artwork, Wall, Room, Floor } from './types'
import { v4 as uuidv4 } from 'uuid'

// Configuration pour le placement d'œuvres
export const ARTWORK_PLACEMENT_CONFIG = {
  // Distances standards (en mètres)
  MIN_WALL_DISTANCE: 0.1,     // Distance minimale du mur
  MAX_WALL_DISTANCE: 0.5,     // Distance maximale du mur
  MIN_SPACING: 1.0,            // Espacement minimal entre œuvres
  OPTIMAL_SPACING: 2.0,        // Espacement optimal
  
  // Hauteurs standards
  HANGING_HEIGHT: 1.5,         // Hauteur d'accrochage
  VIEWING_DISTANCE: 2.0,       // Distance de vue optimale
  
  // Tailles standards d'œuvres
  SIZES: {
    SMALL: [0.4, 0.6],         // Petite œuvre
    MEDIUM: [0.8, 1.0],        // Œuvre moyenne
    LARGE: [1.2, 1.5],         // Grande œuvre
    EXTRA_LARGE: [2.0, 2.5]    // Très grande œuvre
  }
}

export interface WallSegment {
  wall: Wall
  startPoint: Point
  endPoint: Point
  length: number
  normalVector: Point // Vecteur perpendiculaire au mur (vers l'intérieur de la pièce)
  centerPoint: Point
  availableLength: number // Longueur disponible pour œuvres
}

export interface ArtworkPlacement {
  artwork: Artwork
  position: Point
  rotation: number // En radians
  wallAlignment: boolean
  wallSegment?: WallSegment
  spacing: {
    left: number
    right: number
  }
}

// Trouve tous les segments de murs disponibles dans une pièce
export function findWallSegments(room: Room, walls: Wall[]): WallSegment[] {
  const segments: WallSegment[] = []
  
  // Murs du périmètre de la pièce
  for (let i = 0; i < room.polygon.length; i++) {
    const start = room.polygon[i]
    const end = room.polygon[(i + 1) % room.polygon.length]
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    
    if (length > ARTWORK_PLACEMENT_CONFIG.MIN_SPACING) {
      const normalVector = calculateInwardNormal(start, end, room.polygon)
      
      segments.push({
        wall: createVirtualWall(start, end),
        startPoint: start,
        endPoint: end,
        length,
        normalVector,
        centerPoint: {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2
        },
        availableLength: length - 0.5 // Marge pour les coins
      })
    }
  }
  
  // Murs intérieurs
  walls.forEach(wall => {
    if (wall.roomId === room.id) {
      const [start, end] = wall.segment
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      
      if (length > ARTWORK_PLACEMENT_CONFIG.MIN_SPACING) {
        // Calcule les deux côtés du mur
        const normalVector = calculateWallNormal(start, end)
        
        // Côté gauche du mur
        segments.push({
          wall,
          startPoint: start,
          endPoint: end,
          length,
          normalVector,
          centerPoint: {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2
          },
          availableLength: length - 0.3
        })
        
        // Côté droit du mur (normal inversé)
        segments.push({
          wall,
          startPoint: end,
          endPoint: start,
          length,
          normalVector: { x: -normalVector.x, y: -normalVector.y },
          centerPoint: {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2
          },
          availableLength: length - 0.3
        })
      }
    }
  })
  
  return segments
}

// Place automatiquement des œuvres le long d'un mur
export function placeArtworksAlongWall(
  segment: WallSegment,
  artworkSizes: [number, number][],
  spacing: number = ARTWORK_PLACEMENT_CONFIG.OPTIMAL_SPACING
): ArtworkPlacement[] {
  const placements: ArtworkPlacement[] = []
  
  if (artworkSizes.length === 0) return placements
  
  // Calcule l'espace total requis
  const totalArtworkWidth = artworkSizes.reduce((sum, [width]) => sum + width, 0)
  const totalSpacing = (artworkSizes.length - 1) * spacing
  const requiredLength = totalArtworkWidth + totalSpacing
  
  if (requiredLength > segment.availableLength) {
    // Ajuste l'espacement si nécessaire
    spacing = Math.max(
      ARTWORK_PLACEMENT_CONFIG.MIN_SPACING,
      (segment.availableLength - totalArtworkWidth) / (artworkSizes.length - 1)
    )
  }
  
  // Calcule la position de départ pour centrer les œuvres
  const totalUsedLength = totalArtworkWidth + (artworkSizes.length - 1) * spacing
  const startOffset = (segment.length - totalUsedLength) / 2
  
  // Direction le long du mur
  const wallDirection = {
    x: (segment.endPoint.x - segment.startPoint.x) / segment.length,
    y: (segment.endPoint.y - segment.startPoint.y) / segment.length
  }
  
  // Calcule l'angle de rotation pour aligner avec le mur
  const rotation = Math.atan2(wallDirection.y, wallDirection.x)
  
  let currentOffset = startOffset
  
  artworkSizes.forEach(([width, height], index) => {
    // Position le long du mur
    const wallPosition = {
      x: segment.startPoint.x + wallDirection.x * (currentOffset + width / 2),
      y: segment.startPoint.y + wallDirection.y * (currentOffset + width / 2)
    }
    
    // Position finale (décalée du mur)
    const distance = ARTWORK_PLACEMENT_CONFIG.MIN_WALL_DISTANCE + height / 2
    const finalPosition = {
      x: wallPosition.x + segment.normalVector.x * distance,
      y: wallPosition.y + segment.normalVector.y * distance
    }
    
    // Vérifie que la position est valide (dans la pièce)
    if (isValidArtworkPosition(finalPosition, [width, height], segment)) {
      const artwork: Artwork = {
        id: uuidv4(),
        xy: [finalPosition.x, finalPosition.y],
        size: [width, height],
        name: `Œuvre ${index + 1}`
      }
      
      placements.push({
        artwork,
        position: finalPosition,
        rotation,
        wallAlignment: true,
        wallSegment: segment,
        spacing: {
          left: index > 0 ? spacing : 0,
          right: index < artworkSizes.length - 1 ? spacing : 0
        }
      })
    }
    
    currentOffset += width + spacing
  })
  
  return placements
}

// Trouve la meilleure position pour une œuvre spécifique
export function findOptimalArtworkPosition(
  artworkSize: [number, number],
  preferredPosition: Point,
  room: Room,
  walls: Wall[],
  existingArtworks: Artwork[] = []
): ArtworkPlacement | null {
  const segments = findWallSegments(room, walls)
  let bestPlacement: ArtworkPlacement | null = null
  let bestScore = 0
  
  segments.forEach(segment => {
    // Trouve le point le plus proche sur le segment
    const closestPoint = getClosestPointOnWallSegment(preferredPosition, segment)
    
    // Calcule la position décalée du mur
    const [width, height] = artworkSize
    const distance = ARTWORK_PLACEMENT_CONFIG.MIN_WALL_DISTANCE + height / 2
    const position = {
      x: closestPoint.x + segment.normalVector.x * distance,
      y: closestPoint.y + segment.normalVector.y * distance
    }
    
    // Vérifie la validité
    if (!isValidArtworkPosition(position, artworkSize, segment)) return
    
    // Vérifie les conflits avec les œuvres existantes
    if (hasArtworkConflict(position, artworkSize, existingArtworks)) return
    
    // Calcule le score
    const distanceToPreferred = Math.hypot(
      position.x - preferredPosition.x,
      position.y - preferredPosition.y
    )
    
    const score = calculatePlacementScore(position, segment, distanceToPreferred)
    
    if (score > bestScore) {
      bestScore = score
      
      const wallDirection = {
        x: (segment.endPoint.x - segment.startPoint.x) / segment.length,
        y: (segment.endPoint.y - segment.startPoint.y) / segment.length
      }
      const rotation = Math.atan2(wallDirection.y, wallDirection.x)
      
      const artwork: Artwork = {
        id: uuidv4(),
        xy: [position.x, position.y],
        size: artworkSize,
        name: 'Nouvelle œuvre'
      }
      
      bestPlacement = {
        artwork,
        position,
        rotation,
        wallAlignment: true,
        wallSegment: segment,
        spacing: { left: 0, right: 0 }
      }
    }
  })
  
  return bestPlacement
}

// Calcule le vecteur normal vers l'intérieur de la pièce
function calculateInwardNormal(start: Point, end: Point, polygon: readonly Point[]): Point {
  // Vecteur perpendiculaire au mur
  const wallVector = { x: end.x - start.x, y: end.y - start.y }
  const normal1 = { x: -wallVector.y, y: wallVector.x }
  const normal2 = { x: wallVector.y, y: -wallVector.x }
  
  // Point au milieu du mur
  const midPoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  
  // Teste quelle normale pointe vers l'intérieur
  const testPoint1 = {
    x: midPoint.x + normal1.x * 0.1,
    y: midPoint.y + normal1.y * 0.1
  }
  
  const isInside1 = isPointInPolygon(testPoint1, polygon)
  
  if (isInside1) {
    const length = Math.hypot(normal1.x, normal1.y)
    return { x: normal1.x / length, y: normal1.y / length }
  } else {
    const length = Math.hypot(normal2.x, normal2.y)
    return { x: normal2.x / length, y: normal2.y / length }
  }
}

// Calcule le vecteur normal d'un mur
function calculateWallNormal(start: Point, end: Point): Point {
  const wallVector = { x: end.x - start.x, y: end.y - start.y }
  const length = Math.hypot(wallVector.x, wallVector.y)
  
  // Normal perpendiculaire (90° dans le sens antihoraire)
  return {
    x: -wallVector.y / length,
    y: wallVector.x / length
  }
}

// Crée un mur virtuel pour les bords de pièce
function createVirtualWall(start: Point, end: Point): Wall {
  return {
    id: `virtual-${Date.now()}`,
    segment: [start, end],
    thickness: 0.2,
    isLoadBearing: true
  }
}

// Vérifie si un point est dans un polygone
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

// Trouve le point le plus proche sur un segment de mur
function getClosestPointOnWallSegment(point: Point, segment: WallSegment): Point {
  const dx = segment.endPoint.x - segment.startPoint.x
  const dy = segment.endPoint.y - segment.startPoint.y
  const length = Math.hypot(dx, dy)
  
  if (length === 0) return segment.startPoint
  
  const t = Math.max(0, Math.min(1, 
    ((point.x - segment.startPoint.x) * dx + (point.y - segment.startPoint.y) * dy) / (length * length)
  ))
  
  return {
    x: segment.startPoint.x + t * dx,
    y: segment.startPoint.y + t * dy
  }
}

// Vérifie si une position d'œuvre est valide
function isValidArtworkPosition(
  position: Point,
  size: [number, number],
  segment: WallSegment
): boolean {
  const [width, height] = size
  
  // Vérifie que l'œuvre ne dépasse pas les limites
  const corners = [
    { x: position.x - width/2, y: position.y - height/2 },
    { x: position.x + width/2, y: position.y - height/2 },
    { x: position.x + width/2, y: position.y + height/2 },
    { x: position.x - width/2, y: position.y + height/2 }
  ]
  
  // Toutes les coins doivent être dans une zone raisonnable
  return corners.every(corner => {
    const distanceToWall = Math.hypot(
      corner.x - segment.centerPoint.x,
      corner.y - segment.centerPoint.y
    )
    return distanceToWall < segment.length / 2 + Math.max(width, height)
  })
}

// Vérifie les conflits avec d'autres œuvres
function hasArtworkConflict(
  position: Point,
  size: [number, number],
  existingArtworks: Artwork[]
): boolean {
  const [width, height] = size
  const minDistance = ARTWORK_PLACEMENT_CONFIG.MIN_SPACING
  
  return existingArtworks.some(artwork => {
    const [existingWidth, existingHeight] = artwork.size || [1, 1]
    const [existingX, existingY] = artwork.xy
    
    const distance = Math.hypot(position.x - existingX, position.y - existingY)
    const requiredDistance = minDistance + Math.max(width, height, existingWidth, existingHeight) / 2
    
    return distance < requiredDistance
  })
}

// Calcule un score pour évaluer la qualité d'un placement
function calculatePlacementScore(
  position: Point,
  segment: WallSegment,
  distanceToPreferred: number
): number {
  let score = 100
  
  // Pénalise la distance par rapport à la position préférée
  score -= distanceToPreferred * 10
  
  // Bonus pour être centré sur le mur
  const wallCenter = segment.centerPoint
  const distanceToCenter = Math.hypot(
    position.x - wallCenter.x,
    position.y - wallCenter.y
  )
  score -= distanceToCenter * 5
  
  // Bonus pour les murs plus longs (plus de place)
  score += Math.min(segment.length * 2, 20)
  
  return Math.max(0, score)
}