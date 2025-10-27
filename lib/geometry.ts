import type { Point, Door, VerticalLink, Artwork } from "./types"

export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize),
    y: Math.round(point.y / gridSize),
  }
}

export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }
  return inside
}

export function getClosestWallSegment(
  point: Point,
  polygon: Point[],
): { start: Point; end: Point; distance: number } | null {
  if (polygon.length < 2) return null

  let closest: { start: Point; end: Point; distance: number } | null = null

  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i]
    const end = polygon[(i + 1) % polygon.length]

    const distance = distanceToSegment(point, start, end)

    if (!closest || distance < closest.distance) {
      closest = { start, end, distance }
    }
  }

  return closest
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
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

export function polygonsIntersect(poly1: Point[], poly2: Point[]): boolean {
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

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y)

  if (det === 0) return false

  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det

  return 0 < lambda && lambda < 1 && 0 < gamma && gamma < 1
}

export function snapToWallSegment(point: Point, rooms: { polygon: Point[] }[], gridSize = 1): Point | null {
  let closestMidpoint: Point | null = null
  let minDistance = Number.POSITIVE_INFINITY
  const snapThreshold = 0.5 // grid units

  for (const room of rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const start = room.polygon[i]
      const end = room.polygon[(i + 1) % room.polygon.length]

      // Calculate midpoint of wall segment
      const midpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      }

      const distance = Math.hypot(point.x - midpoint.x, point.y - midpoint.y)

      if (distance < minDistance && distance < snapThreshold) {
        minDistance = distance
        closestMidpoint = midpoint
      }
    }
  }

  return closestMidpoint
}

export function rectangleOverlapsRooms(rect: Point[], rooms: { polygon: Point[] }[]): boolean {
  for (const room of rooms) {
    if (polygonsIntersect(rect, room.polygon)) {
      return true
    }
  }
  return false
}

export function createCirclePolygon(center: Point, radius: number, segments = 32): Point[] {
  const points: Point[] = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    points.push({
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    })
  }
  return points
}

export function createTrianglePolygon(p1: Point, p2: Point): Point[] {
  const width = p2.x - p1.x
  const height = p2.y - p1.y

  // Create equilateral-ish triangle
  return [
    { x: p1.x + width / 2, y: p1.y }, // top
    { x: p2.x, y: p2.y }, // bottom right
    { x: p1.x, y: p2.y }, // bottom left
  ]
}

export function createArcPolygon(center: Point, endPoint: Point, segments = 24): Point[] {
  const radius = Math.max(Math.abs(endPoint.x - center.x), Math.abs(endPoint.y - center.y))
  const points: Point[] = []

  // Create a 3/4 circle arc (270 degrees)
  const startAngle = 0
  const endAngle = (3 * Math.PI) / 2

  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / segments)
    points.push({
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    })
  }

  // Close the arc by connecting back to center
  points.push(center)

  return points
}

export function snapToWallSegmentWithPosition(
  point: Point,
  rooms: { polygon: Point[] }[],
  snapThreshold = 0.8,
): { point: Point; segmentStart: Point; segmentEnd: Point } | null {
  let closestSnap: { point: Point; segmentStart: Point; segmentEnd: Point } | null = null
  let minDistance = Number.POSITIVE_INFINITY

  for (const room of rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const start = room.polygon[i]
      const end = room.polygon[(i + 1) % room.polygon.length]

      // Project point onto segment
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lengthSquared = dx * dx + dy * dy

      if (lengthSquared === 0) continue

      const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))

      const projectedPoint = {
        x: start.x + t * dx,
        y: start.y + t * dy,
      }

      const distance = Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y)

      if (distance < minDistance && distance < snapThreshold) {
        minDistance = distance
        closestSnap = {
          point: projectedPoint,
          segmentStart: start,
          segmentEnd: end,
        }
      }
    }
  }

  return closestSnap
}

export function isWallSegmentOccupied(
  segmentStart: Point,
  segmentEnd: Point,
  doors: Door[],
  verticalLinks: VerticalLink[],
  artworks: Artwork[],
  excludeId?: string,
): boolean {
  // Check doors
  for (const door of doors) {
    if (door.id === excludeId) continue
    if (segmentsOverlap(segmentStart, segmentEnd, door.segment[0], door.segment[1])) {
      return true
    }
  }

  // Check vertical links
  for (const link of verticalLinks) {
    if (link.id === excludeId) continue
    if (segmentsOverlap(segmentStart, segmentEnd, link.segment[0], link.segment[1])) {
      return true
    }
  }

  return false
}

function segmentsOverlap(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  // Check if segments are on the same line
  const onSameLine = Math.abs((a2.y - a1.y) * (b2.x - b1.x) - (b2.y - b1.y) * (a2.x - a1.x)) < 0.01

  if (!onSameLine) return false

  // Check if they overlap
  const minAx = Math.min(a1.x, a2.x)
  const maxAx = Math.max(a1.x, a2.x)
  const minBx = Math.min(b1.x, b2.x)
  const maxBx = Math.max(b1.x, b2.x)

  const minAy = Math.min(a1.y, a2.y)
  const maxAy = Math.max(a1.y, a2.y)
  const minBy = Math.min(b1.y, b2.y)
  const maxBy = Math.max(b1.y, b2.y)

  return !(maxAx < minBx || maxBx < minAx || maxAy < minBy || maxBy < minAy)
}

export function calculateWallSegment(
  start: Point,
  end: Point,
  wallStart: Point,
  wallEnd: Point,
): { start: Point; end: Point } {
  // Calculate direction vector of wall
  const dx = wallEnd.x - wallStart.x
  const dy = wallEnd.y - wallStart.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length === 0) return { start, end }

  // Normalize direction
  const dirX = dx / length
  const dirY = dy / length

  // Project start and end onto wall segment
  const t1 = Math.max(0, Math.min(1, ((start.x - wallStart.x) * dx + (start.y - wallStart.y) * dy) / (length * length)))
  const t2 = Math.max(0, Math.min(1, ((end.x - wallStart.x) * dx + (end.y - wallStart.y) * dy) / (length * length)))

  const projStart = {
    x: wallStart.x + t1 * dx,
    y: wallStart.y + t1 * dy,
  }

  const projEnd = {
    x: wallStart.x + t2 * dx,
    y: wallStart.y + t2 * dy,
  }

  return { start: projStart, end: projEnd }
}

export function findWallSegmentForElement(
  elementSegment: [Point, Point],
  rooms: { id: string; polygon: Point[] }[],
): { roomId: string; segmentIndex: number } | null {
  const midpoint = {
    x: (elementSegment[0].x + elementSegment[1].x) / 2,
    y: (elementSegment[0].y + elementSegment[1].y) / 2,
  }

  for (const room of rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const start = room.polygon[i]
      const end = room.polygon[(i + 1) % room.polygon.length]

      const distToSegment = distanceToSegmentHelper(midpoint, start, end)
      if (distToSegment < 0.1) {
        return { roomId: room.id, segmentIndex: i }
      }
    }
  }

  return null
}

function distanceToSegmentHelper(point: Point, start: Point, end: Point): number {
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

export function moveElementWithWall(
  elementSegment: [Point, Point],
  oldWallStart: Point,
  oldWallEnd: Point,
  newWallStart: Point,
  newWallEnd: Point,
): [Point, Point] {
  // Calculate the position of element endpoints relative to the wall
  const oldDx = oldWallEnd.x - oldWallStart.x
  const oldDy = oldWallEnd.y - oldWallStart.y
  const oldLength = Math.sqrt(oldDx * oldDx + oldDy * oldDy)

  if (oldLength === 0) return elementSegment

  // Find t values for start and end points
  const t1 =
    ((elementSegment[0].x - oldWallStart.x) * oldDx + (elementSegment[0].y - oldWallStart.y) * oldDy) /
    (oldLength * oldLength)
  const t2 =
    ((elementSegment[1].x - oldWallStart.x) * oldDx + (elementSegment[1].y - oldWallStart.y) * oldDy) /
    (oldLength * oldLength)

  // Apply same t values to new wall
  const newDx = newWallEnd.x - newWallStart.x
  const newDy = newWallEnd.y - newWallStart.y

  return [
    {
      x: newWallStart.x + t1 * newDx,
      y: newWallStart.y + t1 * newDy,
    },
    {
      x: newWallStart.x + t2 * newDx,
      y: newWallStart.y + t2 * newDy,
    },
  ]
}

export function isElementInRoom(
  element: { xy: [number, number]; size?: [number, number] },
  room: { polygon: Point[] },
): boolean {
  const size = element.size || [1, 1]
  const corners = [
    { x: element.xy[0], y: element.xy[1] },
    { x: element.xy[0] + size[0], y: element.xy[1] },
    { x: element.xy[0] + size[0], y: element.xy[1] + size[1] },
    { x: element.xy[0], y: element.xy[1] + size[1] },
  ]

  return corners.every((corner) => isPointInPolygon(corner, room.polygon))
}

export function projectPointOntoSegment(point: Point, segmentStart: Point, segmentEnd: Point): Point {
  const dx = segmentEnd.x - segmentStart.x
  const dy = segmentEnd.y - segmentStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) return segmentStart

  const t = Math.max(
    0,
    Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared),
  )

  return {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy,
  }
}

export function isArtworkInRoom(
  artwork: { xy: [number, number]; size?: [number, number] },
  room: { polygon: Point[] },
): boolean {
  const size = artwork.size || [1, 1]
  const center = {
    x: artwork.xy[0] + size[0] / 2,
    y: artwork.xy[1] + size[1] / 2,
  }

  // Just check if center is in room - allows touching walls
  return isPointInPolygon(center, room.polygon)
}

export function getArtworkResizeHandle(
  mousePos: Point,
  artwork: { xy: [number, number]; size?: [number, number] },
  threshold = 0.3,
): "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null {
  const size = artwork.size || [1, 1]
  const x = artwork.xy[0]
  const y = artwork.xy[1]
  const w = size[0]
  const h = size[1]

  // Check corners first (higher priority)
  if (Math.hypot(mousePos.x - x, mousePos.y - y) < threshold) return "nw"
  if (Math.hypot(mousePos.x - (x + w), mousePos.y - y) < threshold) return "ne"
  if (Math.hypot(mousePos.x - x, mousePos.y - (y + h)) < threshold) return "sw"
  if (Math.hypot(mousePos.x - (x + w), mousePos.y - (y + h)) < threshold) return "se"

  // Check edges
  if (Math.abs(mousePos.x - x) < threshold && mousePos.y >= y && mousePos.y <= y + h) return "w"
  if (Math.abs(mousePos.x - (x + w)) < threshold && mousePos.y >= y && mousePos.y <= y + h) return "e"
  if (Math.abs(mousePos.y - y) < threshold && mousePos.x >= x && mousePos.x <= x + w) return "n"
  if (Math.abs(mousePos.y - (y + h)) < threshold && mousePos.x >= x && mousePos.x <= x + w) return "s"

  return null
}
