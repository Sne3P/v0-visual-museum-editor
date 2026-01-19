/**
 * SERVICE DE TRANSFORMATION - Déplacement et modification géométrique
 * Fonctions pour transformer (translate, rotate, scale) les éléments
 */

import type { Point, Room, Wall, Door, Artwork, VerticalLink, Entrance } from '@/core/entities'


/**
 * Translater un polygone par un delta
 */
export function translatePolygon(
  polygon: ReadonlyArray<Point>,
  delta: Point
): Point[] {
  return polygon.map(p => ({
    x: p.x + delta.x,
    y: p.y + delta.y
  }))
}

/**
 * Translater une room complète
 */
export function translateRoom(room: Room, delta: Point): Room {
  return {
    ...room,
    polygon: translatePolygon(room.polygon, delta)
  }
}

/**
 * Translater un wall (avec support du path multi-points)
 */
export function translateWall(wall: Wall, delta: Point): Wall {
  const translatedPath = wall.path
    ? wall.path.map(p => ({ x: p.x + delta.x, y: p.y + delta.y }))
    : undefined

  return {
    ...wall,
    segment: [
      { x: wall.segment[0].x + delta.x, y: wall.segment[0].y + delta.y },
      { x: wall.segment[1].x + delta.x, y: wall.segment[1].y + delta.y }
    ],
    path: translatedPath
  }
}

/**
 * Translater une door
 */
export function translateDoor(door: Door, delta: Point): Door {
  return {
    ...door,
    segment: [
      { x: door.segment[0].x + delta.x, y: door.segment[0].y + delta.y },
      { x: door.segment[1].x + delta.x, y: door.segment[1].y + delta.y }
    ]
  }
}

/**
 * Translater une artwork
 */
export function translateArtwork(artwork: Artwork, delta: Point): Artwork {
  return {
    ...artwork,
    xy: [
      artwork.xy[0] + delta.x,
      artwork.xy[1] + delta.y
    ] as readonly [number, number]
  }
}

/**
 * Translater un vertical link
 */
export function translateVerticalLink(link: VerticalLink, delta: Point): VerticalLink {
  return {
    ...link,
    position: {
      x: link.position.x + delta.x,
      y: link.position.y + delta.y
    }
  }
}

/**
 * Translater une entrée
 */
export function translateEntrance(entrance: Entrance, delta: Point): Entrance {
  return {
    ...entrance,
    x: entrance.x + delta.x,
    y: entrance.y + delta.y
  }
}

/**
 * Mettre à jour un vertex dans un polygone
 */
export function updateVertexInPolygon(
  polygon: ReadonlyArray<Point>,
  vertexIndex: number,
  newPosition: Point
): Point[] {
  if (vertexIndex < 0 || vertexIndex >= polygon.length) {
    return [...polygon]
  }
  
  const newPolygon = [...polygon]
  newPolygon[vertexIndex] = newPosition
  return newPolygon
}

/**
 * Mettre à jour un vertex dans une room
 */
export function updateVertexInRoom(
  room: Room,
  vertexIndex: number,
  newPosition: Point
): Room {
  return {
    ...room,
    polygon: updateVertexInPolygon(room.polygon, vertexIndex, newPosition)
  }
}

/**
 * Mettre à jour un segment dans un wall/door/verticalLink
 */
export function updateSegmentEndpoint(
  segment: [Point, Point],
  endpointIndex: 0 | 1,
  newPosition: Point
): [Point, Point] {
  if (endpointIndex === 0) {
    return [newPosition, segment[1]]
  } else {
    return [segment[0], newPosition]
  }
}

/**
 * Calculer le delta entre deux points
 */
export function calculateDelta(from: Point, to: Point): Point {
  return {
    x: to.x - from.x,
    y: to.y - from.y
  }
}

/**
 * Appliquer un delta avec contrainte snap
 */
export function applyDeltaWithSnap(
  originalPoint: Point,
  delta: Point,
  snapFunction: (point: Point) => Point
): Point {
  const newPoint = {
    x: originalPoint.x + delta.x,
    y: originalPoint.y + delta.y
  }
  return snapFunction(newPoint)
}
