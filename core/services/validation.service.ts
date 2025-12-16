/**
 * SERVICE VALIDATION CONSOLIDÉ
 * Toute la logique de validation en un seul endroit
 */

import type { 
  Room, 
  Wall, 
  Artwork, 
  Door, 
  VerticalLink, 
  Floor,
  ValidationResult,
  ExtendedValidationResult,
  ValidationContext 
} from '@/core/entities'
import { CONSTRAINTS, ERROR_MESSAGES, VISUAL_FEEDBACK } from '@/core/constants'
import { 
  calculateBounds, 
  calculatePolygonAreaInMeters,
  polygonsOverlap,
  isPointInPolygon,
  segmentsIntersect,
  distanceToSegment
} from './geometry.service'

/**
 * Valide la géométrie d'une pièce
 */
export function validateRoomGeometry(room: Room, context?: ValidationContext): ExtendedValidationResult {
  // 1. Vérifier le nombre minimum de sommets
  if (room.polygon.length < 3) {
    return {
      valid: false,
      severity: 'error',
      code: 'ROOM_INVALID_SHAPE',
      message: ERROR_MESSAGES.room.invalidShape,
      visualFeedback: {
        color: VISUAL_FEEDBACK.colors.invalid,
        opacity: 0.5,
        strokeWidth: 3
      }
    }
  }

  // 2. Vérifier la superficie minimum
  const area = calculatePolygonAreaInMeters(room.polygon)
  if (area < CONSTRAINTS.room.minArea) {
    return {
      valid: false,
      severity: 'error',
      code: 'ROOM_TOO_SMALL',
      message: ERROR_MESSAGES.room.tooSmall.replace('{minArea}', CONSTRAINTS.room.minArea.toString()),
      suggestions: ['Agrandissez la pièce', 'Ajoutez plus d\'espace'],
      visualFeedback: {
        color: VISUAL_FEEDBACK.colors.warning,
        opacity: 0.6,
        strokeWidth: 3
      }
    }
  }

  // 3. Vérifier les dimensions
  const bounds = calculateBounds(room.polygon)
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  if (width < CONSTRAINTS.room.minWidth) {
    return {
      valid: false,
      severity: 'error',
      code: 'ROOM_TOO_NARROW',
      message: ERROR_MESSAGES.room.tooNarrow.replace('{minWidth}', CONSTRAINTS.room.minWidth.toString()),
      suggestions: ['Élargissez la pièce'],
      visualFeedback: {
        color: VISUAL_FEEDBACK.colors.warning,
        opacity: 0.6,
        strokeWidth: 3
      }
    }
  }

  if (height < CONSTRAINTS.room.minHeight) {
    return {
      valid: false,
      severity: 'error',
      code: 'ROOM_TOO_SHORT',
      message: ERROR_MESSAGES.room.tooShort.replace('{minHeight}', CONSTRAINTS.room.minHeight.toString()),
      suggestions: ['Agrandissez la pièce verticalement'],
      visualFeedback: {
        color: VISUAL_FEEDBACK.colors.warning,
        opacity: 0.6,
        strokeWidth: 3
      }
    }
  }

  // 4. Vérifier le CHEVAUCHEMENT (surfaces internes) avec d'autres pièces
  // Les pièces peuvent SE TOUCHER (arêtes communes, points communs) mais pas SE CHEVAUCHER
  if (context?.floor) {
    const overlappingRooms = context.floor.rooms.filter(otherRoom => {
      if (otherRoom.id === room.id) return false
      if (context.excludeIds?.includes(otherRoom.id)) return false
      // Utiliser polygonsOverlap au lieu de polygonsIntersect
      // pour permettre le contact mais interdire le chevauchement
      return polygonsOverlap(room.polygon, otherRoom.polygon)
    })

    if (overlappingRooms.length > 0) {
      return {
        valid: false,
        severity: 'error',
        code: 'ROOM_OVERLAPPING',
        message: ERROR_MESSAGES.room.overlapping,
        affectedElements: overlappingRooms.map(r => r.id),
        suggestions: ['Déplacez la pièce', 'Réduisez sa taille', 'Les pièces peuvent se toucher mais pas se chevaucher'],
        visualFeedback: {
          color: VISUAL_FEEDBACK.colors.invalid,
          opacity: 0.5,
          strokeWidth: 4,
          highlight: true
        }
      }
    }
  }

  return {
    valid: true,
    severity: 'info',
    code: 'ROOM_VALID',
    message: 'Pièce valide',
    visualFeedback: {
      color: VISUAL_FEEDBACK.colors.valid,
      opacity: 1.0,
      strokeWidth: VISUAL_FEEDBACK.stroke.validThickness
    }
  }
}

/**
 * Valide le placement d'un mur
 */
export function validateWallPlacement(wall: Wall, context: ValidationContext): ExtendedValidationResult {
  // 1. Vérifier longueur minimum
  const length = Math.hypot(
    wall.segment[1].x - wall.segment[0].x,
    wall.segment[1].y - wall.segment[0].y
  )

  if (length < CONSTRAINTS.wall.minLength) {
    return {
      valid: false,
      severity: 'error',
      code: 'WALL_TOO_SHORT',
      message: ERROR_MESSAGES.wall.tooShort.replace('{minLength}', CONSTRAINTS.wall.minLength.toString()),
      suggestions: ['Allongez le mur', 'Repositionnez les extrémités'],
      visualFeedback: {
        color: VISUAL_FEEDBACK.colors.invalid,
        opacity: 0.5,
        strokeWidth: 4
      }
    }
  }

  // 2. Vérifier que le mur est dans une pièce
  if (context.floor) {
    let isInRoom = false
    for (const room of context.floor.rooms) {
      if (isPointInPolygon(wall.segment[0], room.polygon) && 
          isPointInPolygon(wall.segment[1], room.polygon)) {
        isInRoom = true
        break
      }
    }

    if (!isInRoom) {
      return {
        valid: false,
        severity: 'error',
        code: 'WALL_OUTSIDE_ROOM',
        message: ERROR_MESSAGES.wall.outsideRoom,
        suggestions: ['Déplacez le mur dans une pièce', 'Créez une pièce d\'abord'],
        visualFeedback: {
          color: VISUAL_FEEDBACK.colors.invalid,
          opacity: 0.5,
          strokeWidth: 4
        }
      }
    }
  }

  // 3. Vérifier l'intersection avec d'autres murs
  if (context.floor) {
    const intersectingWalls = context.floor.walls.filter(otherWall => {
      if (otherWall.id === wall.id) return false
      if (context.excludeIds?.includes(otherWall.id)) return false
      return segmentsIntersect(wall.segment, otherWall.segment)
    })

    if (intersectingWalls.length > 0) {
      return {
        valid: false,
        severity: 'error',
        code: 'WALL_INTERSECTION',
        message: ERROR_MESSAGES.wall.intersectsOther,
        affectedElements: intersectingWalls.map(w => w.id),
        suggestions: ['Repositionnez le mur', 'Évitez les croisements'],
        visualFeedback: {
          color: VISUAL_FEEDBACK.colors.invalid,
          opacity: 0.4,
          strokeWidth: 4,
          highlight: true
        }
      }
    }
  }

  return {
    valid: true,
    severity: 'info',
    code: 'WALL_VALID',
    message: 'Mur valide',
    visualFeedback: {
      color: VISUAL_FEEDBACK.colors.valid,
      opacity: 1.0,
      strokeWidth: 2
    }
  }
}

/**
 * Valide le placement d'une œuvre
 */
export function validateArtworkPlacement(artwork: Artwork, context: ValidationContext): ExtendedValidationResult {
  const [x, y] = artwork.xy
  const point = { x, y }

  // 1. Vérifier taille minimum si spécifiée
  if (artwork.size) {
    const [width, height] = artwork.size
    if (width < CONSTRAINTS.artwork.minWidth || height < CONSTRAINTS.artwork.minHeight) {
      return {
        valid: false,
        severity: 'error',
        code: 'ARTWORK_TOO_SMALL',
        message: ERROR_MESSAGES.artwork.tooSmall
          .replace('{minWidth}', CONSTRAINTS.artwork.minWidth.toString())
          .replace('{minHeight}', CONSTRAINTS.artwork.minHeight.toString()),
        visualFeedback: {
          color: VISUAL_FEEDBACK.colors.invalid,
          opacity: 0.5,
          strokeWidth: 3
        }
      }
    }
  }

  // 2. Vérifier que l'œuvre est dans une pièce
  if (context.floor) {
    let isInRoom = false
    for (const room of context.floor.rooms) {
      if (isPointInPolygon(point, room.polygon)) {
        isInRoom = true
        break
      }
    }

    if (!isInRoom) {
      return {
        valid: false,
        severity: 'error',
        code: 'ARTWORK_OUTSIDE_ROOM',
        message: ERROR_MESSAGES.artwork.outsideRoom,
        suggestions: ['Placez l\'œuvre dans une pièce', 'Créez une pièce d\'abord'],
        visualFeedback: {
          color: VISUAL_FEEDBACK.colors.invalid,
          opacity: 0.5,
          strokeWidth: 3
        }
      }
    }
  }

  return {
    valid: true,
    severity: 'info',
    code: 'ARTWORK_VALID',
    message: 'Œuvre valide',
    visualFeedback: {
      color: VISUAL_FEEDBACK.colors.valid,
      opacity: 1.0,
      strokeWidth: 2
    }
  }
}

/**
 * Valide une porte
 */
export function validateDoor(door: Door, context: ValidationContext): ValidationResult {
  if (door.width < CONSTRAINTS.door.minWidth || door.width > CONSTRAINTS.door.maxWidth) {
    return {
      valid: false,
      message: `La porte doit avoir une largeur entre ${CONSTRAINTS.door.minWidth} et ${CONSTRAINTS.door.maxWidth} unités`
    }
  }

  return { valid: true }
}

/**
 * Valide un lien vertical
 */
export function validateVerticalLink(link: VerticalLink, context: ValidationContext): ValidationResult {
  if (link.width < CONSTRAINTS.verticalLink.minWidth || link.width > CONSTRAINTS.verticalLink.maxWidth) {
    return {
      valid: false,
      message: `Le lien doit avoir une largeur entre ${CONSTRAINTS.verticalLink.minWidth} et ${CONSTRAINTS.verticalLink.maxWidth} unités`
    }
  }

  return { valid: true }
}
