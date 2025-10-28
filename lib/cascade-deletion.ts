/**
 * Système de suppression en cascade pour l'éditeur de musée
 * Gère automatiquement les dépendances entre éléments
 */

import type { Floor, Room, Wall, Door, Artwork, Escalator, Elevator, VerticalLink } from './types'

// Types pour les résultats de suppression
export interface DeletionResult {
  success: boolean
  deletedElements: {
    rooms: string[]
    walls: string[]
    doors: string[]
    artworks: string[]
    escalators: string[]
    elevators: string[]
    verticalLinks: string[]
    floors: string[]
  }
  affectedFloors: string[]
  message?: string
}

export interface DeletionPlan {
  primaryElement: {
    id: string
    type: 'room' | 'wall' | 'door' | 'artwork' | 'escalator' | 'elevator' | 'floor'
  }
  cascadeElements: Array<{
    id: string
    type: string
    reason: string
    dependsOn: string
  }>
  affectedFloors: string[]
  warnings: string[]
}

// Analyse les dépendances avant suppression
export function analyzeDeletionPlan(
  elementId: string,
  elementType: 'room' | 'wall' | 'door' | 'artwork' | 'escalator' | 'elevator' | 'floor',
  floors: Floor[]
): DeletionPlan {
  const plan: DeletionPlan = {
    primaryElement: { id: elementId, type: elementType },
    cascadeElements: [],
    affectedFloors: [],
    warnings: []
  }

  switch (elementType) {
    case 'room':
      analyzeRoomDeletion(elementId, floors, plan)
      break
    case 'wall':
      analyzeWallDeletion(elementId, floors, plan)
      break
    case 'floor':
      analyzeFloorDeletion(elementId, floors, plan)
      break
    case 'escalator':
      analyzeEscalatorDeletion(elementId, floors, plan)
      break
    case 'elevator':
      analyzeElevatorDeletion(elementId, floors, plan)
      break
    case 'door':
      analyzeDoorDeletion(elementId, floors, plan)
      break
    case 'artwork':
      analyzeArtworkDeletion(elementId, floors, plan)
      break
  }

  return plan
}

// Analyse de suppression d'une pièce
function analyzeRoomDeletion(roomId: string, floors: Floor[], plan: DeletionPlan): void {
  floors.forEach(floor => {
    // Trouve la pièce
    const room = floor.rooms.find(r => r.id === roomId)
    if (!room) return

    plan.affectedFloors.push(floor.id)

    // Murs de la pièce
    floor.walls.forEach(wall => {
      if (wall.roomId === roomId) {
        plan.cascadeElements.push({
          id: wall.id,
          type: 'wall',
          reason: 'Mur intérieur de la pièce supprimée',
          dependsOn: roomId
        })
      }
    })

    // Portes connectées à la pièce
    floor.doors.forEach(door => {
      if (door.room_a === roomId || door.room_b === roomId) {
        plan.cascadeElements.push({
          id: door.id,
          type: 'door',
          reason: 'Porte connectée à la pièce supprimée',
          dependsOn: roomId
        })
      }
    })

    // Œuvres d'art dans la pièce
    floor.artworks.forEach(artwork => {
      if (isArtworkInRoom(artwork, room)) {
        plan.cascadeElements.push({
          id: artwork.id,
          type: 'artwork',
          reason: 'Œuvre située dans la pièce supprimée',
          dependsOn: roomId
        })
      }
    })

    // Escaliers dans la pièce
    floor.escalators.forEach(escalator => {
      if (isEscalatorInRoom(escalator, room)) {
        plan.cascadeElements.push({
          id: escalator.id,
          type: 'escalator',
          reason: 'Escalier situé dans la pièce supprimée',
          dependsOn: roomId
        })

        // Avertissement pour les connexions entre étages
        plan.warnings.push(`L'escalier vers l'étage "${escalator.toFloorId}" sera supprimé`)
      }
    })

    // Ascenseurs dans la pièce
    floor.elevators.forEach(elevator => {
      if (isElevatorInRoom(elevator, room)) {
        plan.cascadeElements.push({
          id: elevator.id,
          type: 'elevator',
          reason: 'Ascenseur situé dans la pièce supprimée',
          dependsOn: roomId
        })

        // Avertissement pour les connexions multiples
        if (elevator.connectedFloorIds.length > 2) {
          plan.warnings.push(`L'ascenseur connecté à ${elevator.connectedFloorIds.length} étages sera supprimé`)
        }
      }
    })
  })
}

// Analyse de suppression d'un mur
function analyzeWallDeletion(wallId: string, floors: Floor[], plan: DeletionPlan): void {
  floors.forEach(floor => {
    const wall = floor.walls.find(w => w.id === wallId)
    if (!wall) return

    plan.affectedFloors.push(floor.id)

    // Portes sur ce mur
    floor.doors.forEach(door => {
      if (isDoorOnWall(door, wall)) {
        plan.cascadeElements.push({
          id: door.id,
          type: 'door',
          reason: 'Porte située sur le mur supprimé',
          dependsOn: wallId
        })
      }
    })

    // Œuvres accrochées au mur
    floor.artworks.forEach(artwork => {
      if (isArtworkOnWall(artwork, wall)) {
        plan.cascadeElements.push({
          id: artwork.id,
          type: 'artwork',
          reason: 'Œuvre accrochée au mur supprimé',
          dependsOn: wallId
        })
      }
    })

    // Avertissement pour murs porteurs
    if (wall.isLoadBearing) {
      plan.warnings.push('ATTENTION: Ce mur est porteur, sa suppression peut affecter la structure')
    }
  })
}

// Analyse de suppression d'un étage
function analyzeFloorDeletion(floorId: string, floors: Floor[], plan: DeletionPlan): void {
  const floor = floors.find(f => f.id === floorId)
  if (!floor) return

  plan.affectedFloors.push(floorId)

  // Tous les éléments de l'étage
  floor.rooms.forEach(room => {
    plan.cascadeElements.push({
      id: room.id,
      type: 'room',
      reason: 'Pièce située sur l\'étage supprimé',
      dependsOn: floorId
    })
  })

  floor.walls.forEach(wall => {
    plan.cascadeElements.push({
      id: wall.id,
      type: 'wall',
      reason: 'Mur situé sur l\'étage supprimé',
      dependsOn: floorId
    })
  })

  floor.doors.forEach(door => {
    plan.cascadeElements.push({
      id: door.id,
      type: 'door',
      reason: 'Porte située sur l\'étage supprimé',
      dependsOn: floorId
    })
  })

  floor.artworks.forEach(artwork => {
    plan.cascadeElements.push({
      id: artwork.id,
      type: 'artwork',
      reason: 'Œuvre située sur l\'étage supprimé',
      dependsOn: floorId
    })
  })

  // Escaliers et ascenseurs connectés
  floors.forEach(otherFloor => {
    if (otherFloor.id === floorId) return

    // Trouve les escaliers qui mènent à cet étage
    otherFloor.escalators.forEach(escalator => {
      if (escalator.toFloorId === floorId) {
        plan.cascadeElements.push({
          id: escalator.id,
          type: 'escalator',
          reason: 'Escalier menant vers l\'étage supprimé',
          dependsOn: floorId
        })
        plan.affectedFloors.push(otherFloor.id)
      }
    })

    // Ascenseurs connectés
    otherFloor.elevators.forEach(elevator => {
      if (elevator.connectedFloorIds.includes(floorId)) {
        if (elevator.connectedFloorIds.length <= 2) {
          // Supprime l'ascenseur s'il ne dessert plus qu'un étage
          plan.cascadeElements.push({
            id: elevator.id,
            type: 'elevator',
            reason: 'Ascenseur ne dessert plus assez d\'étages',
            dependsOn: floorId
          })
        } else {
          // Met à jour l'ascenseur pour retirer cet étage
          plan.warnings.push(`L'ascenseur "${elevator.id}" sera mis à jour pour ne plus desservir cet étage`)
        }
        plan.affectedFloors.push(otherFloor.id)
      }
    })
  })
}

// Analyse de suppression d'un escalier
function analyzeEscalatorDeletion(escalatorId: string, floors: Floor[], plan: DeletionPlan): void {
  floors.forEach(floor => {
    const escalator = floor.escalators.find(e => e.id === escalatorId)
    if (!escalator) return

    plan.affectedFloors.push(floor.id)

    // Trouve l'escalier correspondant sur l'autre étage
    const targetFloor = floors.find(f => f.id === escalator.toFloorId)
    if (targetFloor) {
      const reverseEscalator = targetFloor.escalators.find(e => 
        e.fromFloorId === escalator.toFloorId && e.toFloorId === escalator.fromFloorId
      )
      
      if (reverseEscalator) {
        plan.cascadeElements.push({
          id: reverseEscalator.id,
          type: 'escalator',
          reason: 'Escalier de retour correspondant',
          dependsOn: escalatorId
        })
        plan.affectedFloors.push(targetFloor.id)
      }
    }
  })
}

// Analyse de suppression d'un ascenseur
function analyzeElevatorDeletion(elevatorId: string, floors: Floor[], plan: DeletionPlan): void {
  floors.forEach(floor => {
    const elevator = floor.elevators.find(e => e.id === elevatorId)
    if (!elevator) return

    plan.affectedFloors.push(floor.id)

    // L'ascenseur existe sur tous les étages connectés
    elevator.connectedFloorIds.forEach(connectedFloorId => {
      if (connectedFloorId !== floor.id) {
        plan.affectedFloors.push(connectedFloorId)
      }
    })

    plan.warnings.push(`Ascenseur connecté à ${elevator.connectedFloorIds.length} étages`)
  })
}

// Analyse de suppression d'une porte
function analyzeDoorDeletion(doorId: string, floors: Floor[], plan: DeletionPlan): void {
  floors.forEach(floor => {
    const door = floor.doors.find(d => d.id === doorId)
    if (door) {
      plan.affectedFloors.push(floor.id)
      // Les portes n'ont généralement pas de dépendances
    }
  })
}

// Analyse de suppression d'une œuvre
function analyzeArtworkDeletion(artworkId: string, floors: Floor[], plan: DeletionPlan): void {
  floors.forEach(floor => {
    const artwork = floor.artworks.find(a => a.id === artworkId)
    if (artwork) {
      plan.affectedFloors.push(floor.id)
      // Les œuvres n'ont généralement pas de dépendances
    }
  })
}

// Exécute la suppression en cascade
export function executeCascadeDeletion(
  plan: DeletionPlan,
  floors: Floor[]
): DeletionResult {
  const result: DeletionResult = {
    success: true,
    deletedElements: {
      rooms: [],
      walls: [],
      doors: [],
      artworks: [],
      escalators: [],
      elevators: [],
      verticalLinks: [],
      floors: []
    },
    affectedFloors: [...plan.affectedFloors]
  }

  try {
    // Supprime l'élément principal
    result.deletedElements[`${plan.primaryElement.type}s` as keyof typeof result.deletedElements].push(plan.primaryElement.id)

    // Supprime les éléments en cascade
    plan.cascadeElements.forEach(element => {
      const key = `${element.type}s` as keyof typeof result.deletedElements
      if (key in result.deletedElements) {
        (result.deletedElements[key] as string[]).push(element.id)
      }
    })

    result.message = `Suppression réussie: ${plan.cascadeElements.length + 1} éléments supprimés`
  } catch (error) {
    result.success = false
    result.message = `Erreur lors de la suppression: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
  }

  return result
}

// Fonctions utilitaires de détection de position

function isArtworkInRoom(artwork: Artwork, room: Room): boolean {
  const [x, y] = artwork.xy
  return isPointInPolygon({ x, y }, room.polygon)
}

function isEscalatorInRoom(escalator: Escalator, room: Room): boolean {
  const midPoint = {
    x: (escalator.startPosition.x + escalator.endPosition.x) / 2,
    y: (escalator.startPosition.y + escalator.endPosition.y) / 2
  }
  return isPointInPolygon(midPoint, room.polygon)
}

function isElevatorInRoom(elevator: Elevator, room: Room): boolean {
  return isPointInPolygon(elevator.position, room.polygon)
}

function isDoorOnWall(door: Door, wall: Wall): boolean {
  // Vérifie si la porte est sur le segment du mur
  const [doorStart, doorEnd] = door.segment
  const [wallStart, wallEnd] = wall.segment
  
  // Vérifie si les points de la porte sont sur la ligne du mur
  return isPointOnLineSegment(doorStart, wallStart, wallEnd) ||
         isPointOnLineSegment(doorEnd, wallStart, wallEnd)
}

function isArtworkOnWall(artwork: Artwork, wall: Wall): boolean {
  const [x, y] = artwork.xy
  const artworkPoint = { x, y }
  const [wallStart, wallEnd] = wall.segment
  
  // Calcule la distance du point à la ligne du mur
  const distance = distancePointToLineSegment(artworkPoint, wallStart, wallEnd)
  
  // Considère que l'œuvre est sur le mur si elle est très proche
  return distance < 0.5 // 50cm de tolérance
}

function isPointInPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]): boolean {
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

function isPointOnLineSegment(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  tolerance: number = 0.1
): boolean {
  const distance = distancePointToLineSegment(point, lineStart, lineEnd)
  return distance <= tolerance
}

function distancePointToLineSegment(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const A = point.x - lineStart.x
  const B = point.y - lineStart.y
  const C = lineEnd.x - lineStart.x
  const D = lineEnd.y - lineStart.y
  
  const dot = A * C + B * D
  const lenSq = C * C + D * D
  
  if (lenSq === 0) {
    // La ligne est un point
    return Math.hypot(A, B)
  }
  
  let param = dot / lenSq
  
  if (param < 0) {
    return Math.hypot(A, B)
  } else if (param > 1) {
    return Math.hypot(point.x - lineEnd.x, point.y - lineEnd.y)
  } else {
    const closestX = lineStart.x + param * C
    const closestY = lineStart.y + param * D
    return Math.hypot(point.x - closestX, point.y - closestY)
  }
}