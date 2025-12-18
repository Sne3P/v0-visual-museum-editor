/**
 * POINT D'ENTRÉE UNIQUE POUR TOUS LES TYPES
 * Centralise l'export de toutes les entités
 */

// Géométrie
export type { Point, Bounds, Segment, Polygon } from './geometry.types'

// Musée
export type {
  Room,
  Artwork,
  Door,
  VerticalLink,
  Escalator,
  Elevator,
  Wall,
  Floor
} from './museum.types'

// Éditeur
export type {
  Tool,
  ElementType,
  DragElementType,
  HoverElementType,
  SelectionInfo,
  SelectedElement,
  DragInfo,
  HoverInfo,
  ContextMenuAction,
  ContextMenuState,
  MeasurementDisplay,
  MeasurementState,
  ViewState,
  HistoryEntry,
  EditorState
} from './editor.types'

// Validation
export type {
  ValidationResult,
  ExtendedValidationResult,
  ValidationContext,
  GeometryOperation
} from './validation.types'