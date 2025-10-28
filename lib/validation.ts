import type { Point, Room, Artwork, Door, VerticalLink, ValidationResult, Bounds } from './types'
import { VALIDATION, GEOMETRY } from './constants'

/**
 * Enhanced validation utilities for the museum editor
 */

/**
 * Validate room geometry
 */
export function validateRoom(room: Room): ValidationResult {
  const { polygon } = room
  
  if (polygon.length < GEOMETRY.minPolygonVertices) {
    return {
      valid: false,
      message: `Room must have at least ${GEOMETRY.minPolygonVertices} vertices`,
      suggestions: ['Add more points to complete the room shape']
    }
  }
  
  // Check for self-intersections
  if (hasPolygonSelfIntersection(polygon)) {
    return {
      valid: false,
      message: 'Room polygon cannot intersect itself',
      suggestions: ['Adjust vertices to create a simple polygon']
    }
  }
  
  // Check minimum area
  const area = calculatePolygonArea(polygon)
  if (area < GEOMETRY.minRoomSize) {
    return {
      valid: false,
      message: `Room area is too small (minimum: ${GEOMETRY.minRoomSize} grid units)`,
      suggestions: ['Increase room size or check vertex positions']
    }
  }
  
  return { valid: true }
}

/**
 * Validate artwork placement
 */
export function validateArtwork(artwork: Artwork, rooms: ReadonlyArray<Room>): ValidationResult {
  const size = artwork.size || [1, 1]
  
  if (size[0] < GEOMETRY.minArtworkSize || size[1] < GEOMETRY.minArtworkSize) {
    return {
      valid: false,
      message: `Artwork size too small (minimum: ${GEOMETRY.minArtworkSize}x${GEOMETRY.minArtworkSize})`,
      suggestions: ['Increase artwork dimensions']
    }
  }
  
  if (size[0] > GEOMETRY.maxArtworkSize || size[1] > GEOMETRY.maxArtworkSize) {
    return {
      valid: false,
      message: `Artwork size too large (maximum: ${GEOMETRY.maxArtworkSize}x${GEOMETRY.maxArtworkSize})`,
      suggestions: ['Reduce artwork dimensions']
    }
  }
  
  // Check if artwork is within a room
  const artworkBounds = getArtworkBounds(artwork)
  const containingRoom = rooms.find(room => isArtworkInRoom(artworkBounds, room))
  
  if (!containingRoom) {
    return {
      valid: false,
      message: 'Artwork must be placed within a room',
      suggestions: ['Move artwork inside a room boundary']
    }
  }
  
  return { valid: true }
}

/**
 * Validate door placement
 */
export function validateDoor(door: Door, rooms: ReadonlyArray<Room>): ValidationResult {
  if (door.width < VALIDATION.minDoorWidth) {
    return {
      valid: false,
      message: `Door too narrow (minimum: ${VALIDATION.minDoorWidth} grid units)`,
      suggestions: ['Increase door width']
    }
  }
  
  if (door.width > VALIDATION.maxDoorWidth) {
    return {
      valid: false,
      message: `Door too wide (maximum: ${VALIDATION.maxDoorWidth} grid units)`,
      suggestions: ['Reduce door width']
    }
  }
  
  // Check if door is on a room wall
  const wallInfo = findWallForSegment(door.segment, rooms)
  if (!wallInfo) {
    return {
      valid: false,
      message: 'Door must be placed on a room wall',
      suggestions: ['Move door to align with a room wall']
    }
  }
  
  return { valid: true }
}

/**
 * Validate vertical link placement
 */
export function validateVerticalLink(link: VerticalLink, rooms: ReadonlyArray<Room>): ValidationResult {
  if (link.width < VALIDATION.minLinkWidth) {
    return {
      valid: false,
      message: `${link.type} too narrow (minimum: ${VALIDATION.minLinkWidth} grid units)`,
      suggestions: ['Increase width']
    }
  }
  
  if (link.width > VALIDATION.maxLinkWidth) {
    return {
      valid: false,
      message: `${link.type} too wide (maximum: ${VALIDATION.maxLinkWidth} grid units)`,
      suggestions: ['Reduce width']
    }
  }
  
  // Check if link is on a room wall
  const wallInfo = findWallForSegment(link.segment, rooms)
  if (!wallInfo) {
    return {
      valid: false,
      message: `${link.type} must be placed on a room wall`,
      suggestions: ['Move to align with a room wall']
    }
  }
  
  if (!link.to_floor) {
    return {
      valid: false,
      message: `${link.type} must specify destination floor`,
      suggestions: ['Set the target floor in properties']
    }
  }
  
  return { valid: true }
}

/**
 * Check for room overlaps
 */
export function validateRoomOverlaps(rooms: ReadonlyArray<Room>): ValidationResult {
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (doPolygonsOverlap(rooms[i].polygon, rooms[j].polygon)) {
        return {
          valid: false,
          message: `Rooms ${rooms[i].id} and ${rooms[j].id} overlap`,
          suggestions: [
            'Adjust room boundaries to prevent overlap',
            'Check vertex positions'
          ]
        }
      }
    }
  }
  
  return { valid: true }
}

/**
 * Validate element placement within rooms
 */
export function validateElementsInRooms(
  artworks: ReadonlyArray<Artwork>,
  rooms: ReadonlyArray<Room>
): ValidationResult {
  const orphanedArtworks = artworks.filter(artwork => {
    const bounds = getArtworkBounds(artwork)
    return !rooms.some(room => isArtworkInRoom(bounds, room))
  })
  
  if (orphanedArtworks.length > 0) {
    return {
      valid: false,
      message: `${orphanedArtworks.length} artwork(s) not in any room`,
      suggestions: [
        'Move artworks inside room boundaries',
        'Expand room boundaries to include artworks'
      ]
    }
  }
  
  return { valid: true }
}

// Helper functions

function hasPolygonSelfIntersection(polygon: ReadonlyArray<Point>): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a1 = polygon[i]
    const a2 = polygon[(i + 1) % polygon.length]
    
    for (let j = i + 2; j < polygon.length; j++) {
      // Skip adjacent edges
      if (j === polygon.length - 1 && i === 0) continue
      
      const b1 = polygon[j]
      const b2 = polygon[(j + 1) % polygon.length]
      
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true
      }
    }
  }
  
  return false
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y)
  if (Math.abs(det) < 1e-10) return false
  
  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det
  
  return lambda > 0 && lambda < 1 && gamma > 0 && gamma < 1
}

function calculatePolygonArea(polygon: ReadonlyArray<Point>): number {
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].x * polygon[j].y
    area -= polygon[j].x * polygon[i].y
  }
  return Math.abs(area) / 2
}

function doPolygonsOverlap(poly1: ReadonlyArray<Point>, poly2: ReadonlyArray<Point>): boolean {
  // Check if any edges intersect
  for (let i = 0; i < poly1.length; i++) {
    const a1 = poly1[i]
    const a2 = poly1[(i + 1) % poly1.length]
    
    for (let j = 0; j < poly2.length; j++) {
      const b1 = poly2[j]
      const b2 = poly2[(j + 1) % poly2.length]
      
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true
      }
    }
  }
  
  // Check if one polygon is inside the other
  if (isPointInPolygon(poly1[0], poly2) || isPointInPolygon(poly2[0], poly1)) {
    return true
  }
  
  return false
}

function isPointInPolygon(point: Point, polygon: ReadonlyArray<Point>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function getArtworkBounds(artwork: Artwork): Bounds {
  const size = artwork.size || [1, 1]
  return {
    minX: artwork.xy[0],
    minY: artwork.xy[1],
    maxX: artwork.xy[0] + size[0],
    maxY: artwork.xy[1] + size[1]
  }
}

function isArtworkInRoom(bounds: Bounds, room: Room): boolean {
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ]
  
  return corners.every(corner => isPointInPolygon(corner, room.polygon))
}

function findWallForSegment(
  segment: readonly [Point, Point],
  rooms: ReadonlyArray<Room>
): { room: Room; wallIndex: number } | null {
  const midpoint = {
    x: (segment[0].x + segment[1].x) / 2,
    y: (segment[0].y + segment[1].y) / 2
  }
  
  for (const room of rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const start = room.polygon[i]
      const end = room.polygon[(i + 1) % room.polygon.length]
      
      const distToWall = distancePointToSegment(midpoint, start, end)
      if (distToWall < VALIDATION.roomOverlapTolerance) {
        return { room, wallIndex: i }
      }
    }
  }
  
  return null
}

function distancePointToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  const projX = start.x + t * dx
  const projY = start.y + t * dy
  
  return Math.hypot(point.x - projX, point.y - projY)
}