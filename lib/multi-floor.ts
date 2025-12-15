/**
 * Système de gestion multi-étages pour l'éditeur de musée
 * Gère les escaliers, ascenseurs et synchronisation entre étages
 */

import type { Point, Floor, Escalator, Elevator, Room } from './types'
import { v4 as uuidv4 } from 'uuid'

// Configuration des escaliers et ascenseurs
export const VERTICAL_TRANSPORT_CONFIG = {
  ESCALATOR: {
    MIN_WIDTH: 1.5,    // Largeur minimale d'un escalier
    MIN_LENGTH: 3.0,   // Longueur minimale
    STEP_HEIGHT: 0.15, // Hauteur des marches
    ANGLE: 30          // Angle standard en degrés
  },
  ELEVATOR: {
    MIN_SIZE: 1.5,     // Taille minimale (carré)
    MAX_SIZE: 3.0,     // Taille maximale
    DOOR_WIDTH: 0.9    // Largeur de porte
  }
}

// Types pour la gestion multi-étages
export interface FloorConnection {
  fromFloorId: string
  toFloorId: string
  transportId: string
  transportType: 'escalator' | 'elevator'
  position: Point
  synchronized: boolean
}

export interface FloorManager {
  floors: Floor[]
  connections: FloorConnection[]
  activeFloorId: string
}

// Crée un nouvel escalier
export function createEscalator(
  startPosition: Point,
  endPosition: Point,
  fromFloorId: string,
  toFloorId: string,
  direction: 'up' | 'down' = 'up'
): Escalator {
  const length = Math.hypot(
    endPosition.x - startPosition.x,
    endPosition.y - startPosition.y
  )
  
  if (length < VERTICAL_TRANSPORT_CONFIG.ESCALATOR.MIN_LENGTH) {
    throw new Error(`Escalier trop court. Minimum: ${VERTICAL_TRANSPORT_CONFIG.ESCALATOR.MIN_LENGTH}m`)
  }
  
  return {
    id: uuidv4(),
    startPosition,
    endPosition,
    fromFloorId,
    toFloorId,
    direction,
    width: VERTICAL_TRANSPORT_CONFIG.ESCALATOR.MIN_WIDTH
  }
}

// Crée un nouvel ascenseur
export function createElevator(
  position: Point,
  size: number,
  connectedFloorIds: string[]
): Elevator {
  if (size < VERTICAL_TRANSPORT_CONFIG.ELEVATOR.MIN_SIZE) {
    throw new Error(`Ascenseur trop petit. Minimum: ${VERTICAL_TRANSPORT_CONFIG.ELEVATOR.MIN_SIZE}m`)
  }
  
  if (size > VERTICAL_TRANSPORT_CONFIG.ELEVATOR.MAX_SIZE) {
    throw new Error(`Ascenseur trop grand. Maximum: ${VERTICAL_TRANSPORT_CONFIG.ELEVATOR.MAX_SIZE}m`)
  }
  
  return {
    id: uuidv4(),
    position,
    size,
    connectedFloorIds
  }
}

// Crée automatiquement un étage connecté via escalier
export function createConnectedFloor(
  baseFloor: Floor,
  escalator: Escalator,
  floorNumber: number,
  name?: string
): Floor {
  let newFloor: Floor = {
    id: uuidv4(),
    name: name || `Étage ${floorNumber}`,
    rooms: [],
    walls: [],
    escalators: [],
    elevators: [],
    artworks: [],
    doors: [],
    verticalLinks: []
  }
  
  // Copie la structure de base si c'est un étage supérieur
  if (floorNumber > 1) {
    // Copie les pièces principales (sans les détails intérieurs)
    const copiedRooms = baseFloor.rooms.map(room => ({
      ...room,
      id: uuidv4()
    }))
    
    // Copie les murs structurels
    const copiedWalls = baseFloor.walls
      .filter(wall => wall.isLoadBearing)
      .map(wall => ({
        ...wall,
        id: uuidv4()
      }))

    newFloor = {
      ...newFloor,
      rooms: copiedRooms,
      walls: copiedWalls
    }
  }
  
  return newFloor
}

// Synchronise les escaliers entre étages
export function synchronizeEscalators(
  floors: Floor[],
  escalator: Escalator
): Floor[] {
  const updatedFloors = [...floors]
  
  // Trouve les étages concernés
  const fromFloorIndex = floors.findIndex(f => f.id === escalator.fromFloorId)
  const toFloorIndex = floors.findIndex(f => f.id === escalator.toFloorId)
  
  if (fromFloorIndex === -1 || toFloorIndex === -1) {
    throw new Error('Étages introuvables pour la synchronisation')
  }
  
  // Ajoute l'escalier à l'étage de départ
  updatedFloors[fromFloorIndex] = {
    ...updatedFloors[fromFloorIndex],
    escalators: [...updatedFloors[fromFloorIndex].escalators, escalator]
  }
  
  // Crée l'escalier inverse pour l'étage d'arrivée
  const reverseEscalator: Escalator = {
    ...escalator,
    id: uuidv4(),
    fromFloorId: escalator.toFloorId,
    toFloorId: escalator.fromFloorId,
    direction: escalator.direction === 'up' ? 'down' : 'up',
    // Position légèrement décalée pour éviter la superposition
    startPosition: {
      x: escalator.endPosition.x,
      y: escalator.endPosition.y
    },
    endPosition: {
      x: escalator.startPosition.x,
      y: escalator.startPosition.y
    }
  }
  
  updatedFloors[toFloorIndex] = {
    ...updatedFloors[toFloorIndex],
    escalators: [...updatedFloors[toFloorIndex].escalators, reverseEscalator]
  }
  
  return updatedFloors
}

// Synchronise les ascenseurs entre étages
export function synchronizeElevator(
  floors: Floor[],
  elevator: Elevator
): Floor[] {
  const updatedFloors = [...floors]
  
  // Ajoute l'ascenseur à tous les étages connectés
  elevator.connectedFloorIds.forEach(floorId => {
    const floorIndex = floors.findIndex(f => f.id === floorId)
    if (floorIndex !== -1) {
      updatedFloors[floorIndex] = {
        ...updatedFloors[floorIndex],
        elevators: [...updatedFloors[floorIndex].elevators, elevator]
      }
    }
  })
  
  return updatedFloors
}

// Trouve l'emplacement optimal pour un escalier/ascenseur
export function findOptimalTransportLocation(
  room: Room,
  transportType: 'escalator' | 'elevator'
): Point {
  // Calcule le centre de la pièce
  const bounds = getRoomBounds(room)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  
  // Pour les escaliers, privilégie les zones près des murs
  if (transportType === 'escalator') {
    // Trouve le mur le plus long
    let longestWallMidpoint = { x: centerX, y: centerY }
    let maxWallLength = 0
    
    for (let i = 0; i < room.polygon.length; i++) {
      const current = room.polygon[i]
      const next = room.polygon[(i + 1) % room.polygon.length]
      const wallLength = Math.hypot(next.x - current.x, next.y - current.y)
      
      if (wallLength > maxWallLength) {
        maxWallLength = wallLength
        longestWallMidpoint = {
          x: (current.x + next.x) / 2,
          y: (current.y + next.y) / 2
        }
      }
    }
    
    return longestWallMidpoint
  }
  
  // Pour les ascenseurs, privilégie le centre
  return { x: centerX, y: centerY }
}

// Valide qu'un transport vertical peut être placé
export function validateTransportPlacement(
  transport: Escalator | Elevator,
  room: Room,
  existingTransports: (Escalator | Elevator)[]
): { valid: boolean; message?: string } {
  // Vérifie que le transport est dans la pièce
  const isInRoom = 'startPosition' in transport
    ? isPointInRoom(transport.startPosition, room) && isPointInRoom(transport.endPosition, room)
    : isPointInRoom(transport.position, room)
  
  if (!isInRoom) {
    return { valid: false, message: 'Le transport doit être entièrement dans la pièce' }
  }
  
  // Vérifie les conflits avec les transports existants
  const hasConflict = existingTransports.some(existing => {
    if ('startPosition' in transport && 'startPosition' in existing) {
      // Escalier vs escalier
      return doEscalatorsOverlap(transport, existing)
    } else if ('position' in transport && 'position' in existing) {
      // Ascenseur vs ascenseur
      return doElevatorsOverlap(transport, existing)
    }
    return false
  })
  
  if (hasConflict) {
    return { valid: false, message: 'Conflit avec un transport existant' }
  }
  
  return { valid: true }
}

// Vérifie si un point est dans une pièce
function isPointInRoom(point: Point, room: Room): boolean {
  if (room.polygon.length < 3) return false
  
  let inside = false
  const { x, y } = point
  
  for (let i = 0, j = room.polygon.length - 1; i < room.polygon.length; j = i++) {
    const xi = room.polygon[i].x
    const yi = room.polygon[i].y
    const xj = room.polygon[j].x
    const yj = room.polygon[j].y
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  
  return inside
}

// Vérifie si deux escaliers se chevauchent
function doEscalatorsOverlap(esc1: Escalator, esc2: Escalator): boolean {
  const distance1 = Math.hypot(
    esc1.startPosition.x - esc2.startPosition.x,
    esc1.startPosition.y - esc2.startPosition.y
  )
  const distance2 = Math.hypot(
    esc1.endPosition.x - esc2.endPosition.x,
    esc1.endPosition.y - esc2.endPosition.y
  )
  
  const minDistance = Math.max(esc1.width, esc2.width) + 0.5 // Marge de sécurité
  
  return distance1 < minDistance || distance2 < minDistance
}

// Vérifie si deux ascenseurs se chevauchent
function doElevatorsOverlap(elev1: Elevator, elev2: Elevator): boolean {
  const distance = Math.hypot(
    elev1.position.x - elev2.position.x,
    elev1.position.y - elev2.position.y
  )
  
  const minDistance = (elev1.size + elev2.size) / 2 + 0.5 // Marge de sécurité
  
  return distance < minDistance
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

// Suppression en cascade lors de la suppression d'un étage
export function cascadeDeleteFloor(
  floors: Floor[],
  floorIdToDelete: string
): { updatedFloors: Floor[]; deletedConnections: FloorConnection[] } {
  const filteredFloors = floors.filter(floor => floor.id !== floorIdToDelete)
  const deletedConnections: FloorConnection[] = []
  
  // Supprime tous les escaliers et ascenseurs connectés à cet étage
  const updatedFloors = filteredFloors.map(floor => {
    // Filtre les escaliers
    const filteredEscalators = floor.escalators?.filter(escalator => {
      if (escalator.fromFloorId === floorIdToDelete || escalator.toFloorId === floorIdToDelete) {
        deletedConnections.push({
          fromFloorId: escalator.fromFloorId,
          toFloorId: escalator.toFloorId,
          transportId: escalator.id,
          transportType: 'escalator',
          position: escalator.startPosition,
          synchronized: true
        })
        return false
      }
      return true
    }) || []
    
    // Met à jour les ascenseurs
    const updatedElevators = floor.elevators?.map(elevator => ({
      ...elevator,
      connectedFloorIds: elevator.connectedFloorIds.filter(id => id !== floorIdToDelete)
    })).filter(elevator => elevator.connectedFloorIds.length > 1) || [] // Supprime les ascenseurs avec moins de 2 étages

    return {
      ...floor,
      escalators: filteredEscalators,
      elevators: updatedElevators
    }
  })
  
  return { updatedFloors, deletedConnections }
}