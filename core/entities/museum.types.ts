/**
 * TYPES MÉTIER MUSÉE
 * Structures pour les éléments d'un plan de musée
 * Format compatible avec l'ancien système et la DB
 */

import type { Point } from './geometry.types'

// ==================== ROOM ====================

export interface Room {
  readonly id: string
  readonly polygon: ReadonlyArray<Point>
}

// ==================== ARTWORK ====================

export interface Artwork {
  readonly id: string
  readonly xy: readonly [number, number]
  readonly size?: readonly [number, number]
  readonly name?: string
  readonly pdf_id?: string
  readonly pdfLink?: string
  readonly tempPdfFile?: File | null
  readonly tempPdfBase64?: string | null
  readonly roomId?: string  // Pour liaison parent-enfant (cascade)
}

// ==================== DOOR ====================

export interface Door {
  readonly id: string
  readonly room_a: string
  readonly room_b: string
  readonly segment: readonly [Point, Point]
  readonly width: number
  readonly roomId?: string  // Pour liaison parent-enfant (cascade)
}

// ==================== VERTICAL LINK ====================
// Lien technique entre étages (pas de représentation visuelle dans autres étages)
export interface VerticalLink {
  readonly id: string
  readonly type: "stairs" | "elevator"
  readonly floorId: string  // Étage où est physiquement situé l'élément
  readonly position: Point  // Position simple (centre)
  readonly size: readonly [number, number]  // [largeur, hauteur] pour le rectangle
  readonly connectedFloorIds: readonly string[]  // Liste des étages connectés (liens techniques)
  readonly roomId?: string  // Room parent (contrainte: doit rester dans cette room)
  readonly linkGroupId?: string  // ID commun pour tous les segments du même escalier/ascenseur
  readonly linkNumber?: number  // Numéro d'escalier/ascenseur (escalier 1, 2, etc.)
}

// ==================== ESCALATOR ====================

export interface Escalator {
  readonly id: string
  readonly startPosition: Point
  readonly endPosition: Point
  readonly fromFloorId: string
  readonly toFloorId: string
  readonly direction: "up" | "down"
  readonly width: number
}

// ==================== ELEVATOR ====================

export interface Elevator {
  readonly id: string
  readonly position: Point
  readonly size: number
  readonly connectedFloorIds: string[]
}

// ==================== WALL ====================

export interface Wall {
  readonly id: string
  readonly segment: readonly [Point, Point]  // Pour compatibilité avec murs simples
  readonly path?: readonly Point[]  // Pour murs multi-points (si défini, utiliser ça au lieu de segment)
  readonly thickness: number
  readonly roomId?: string
  readonly isLoadBearing?: boolean
}

// ==================== FLOOR ====================

export interface Floor {
  readonly id: string
  readonly name: string
  readonly rooms: ReadonlyArray<Room>
  readonly doors: ReadonlyArray<Door>
  readonly walls: ReadonlyArray<Wall>
  readonly artworks: ReadonlyArray<Artwork>
  readonly verticalLinks: ReadonlyArray<VerticalLink>
  readonly escalators: ReadonlyArray<Escalator>
  readonly elevators: ReadonlyArray<Elevator>
}
