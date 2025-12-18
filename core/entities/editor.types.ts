/**
 * TYPES ÉDITEUR
 * Structures pour l'état et l'interaction avec l'éditeur
 */

import type { Point } from './geometry.types'
import type { Floor } from './museum.types'

export type Tool =
  | "select"
  | "room"
  | "rectangle"
  | "circle"
  | "arc"
  | "triangle"
  | "artwork"
  | "door"
  | "wall"
  | "stairs"
  | "elevator"

export type ElementType = "room" | "artwork" | "door" | "wall" | "verticalLink"
export type DragElementType = ElementType | "vertex"
export type HoverElementType = ElementType | "vertex" | "segment" | "doorEndpoint" | "linkEndpoint" | "wallEndpoint"

export interface SelectionInfo {
  readonly id: string
  readonly type: ElementType | "vertex" | "segment"
  readonly vertexIndex?: number
  readonly segmentIndex?: number
  readonly roomId?: string
}

// Alias simplifié pour la sélection
export interface SelectedElement {
  readonly type: ElementType | "vertex" | "segment"
  readonly id: string
  readonly vertexIndex?: number
  readonly segmentIndex?: number
  readonly roomId?: string
}

export interface DragInfo {
  readonly elementId: string
  readonly elementType: DragElementType
  readonly startPos: Point
  readonly originalPos: Point | ReadonlyArray<Point>
  readonly isValid: boolean
}

export interface HoverInfo {
  readonly type: HoverElementType
  readonly id: string
  readonly vertexIndex?: number
  readonly endpoint?: "start" | "end"
  readonly roomId?: string
  readonly segmentIndex?: number
}

// Actions du menu contextuel
export type ContextMenuAction =
  | 'supprimer' | 'dupliquer' | 'copier' | 'proprietes'
  | 'editer_vertices' | 'convertir_rectangle' | 'convertir_cercle' | 'convertir_triangle' | 'convertir_arc'
  | 'diviser' | 'fusionner' | 'creer_porte'
  | 'retourner' | 'changer_type'
  | 'pivoter' | 'redimensionner'
  | 'aller_haut' | 'aller_bas' | 'changer_type_lien'
  | 'editer_segment' | 'ajouter_vertex'
  | 'zoom_avant' | 'zoom_arriere' | 'reinitialiser_zoom' | 'ajuster_vue' | 'recentrer' | 'actualiser' | 'coller'
  | 'separator'

export interface ContextMenuState {
  readonly visible: boolean
  readonly x: number
  readonly y: number
  readonly type: "element" | "background" | null
  readonly elementId?: string
  readonly elementType?: ElementType
  readonly worldPos?: Point
}

export interface MeasurementDisplay {
  readonly id: string
  readonly type: "distance" | "area"
  readonly position: Point
  readonly value: number
  readonly unit: "m" | "m²"
  readonly elementId?: string
}

export interface MeasurementState {
  readonly showMeasurements: boolean
  readonly showDynamicMeasurements: boolean
  readonly measurements: ReadonlyArray<MeasurementDisplay>
}

export interface ViewState {
  readonly zoom: number
  readonly pan: Point
  readonly isPanning: boolean
}

export interface HistoryEntry {
  readonly state: EditorState
  readonly description: string
  readonly timestamp: number
}

export interface EditorState {
  readonly floors: ReadonlyArray<Floor>
  readonly currentFloorId: string
  readonly selectedTool: Tool
  readonly selectedElementId?: string | null
  readonly selectedElementType?: ElementType | "vertex" | "segment" | null
  readonly selectedElements: ReadonlyArray<SelectedElement>
  readonly gridSize: number
  readonly zoom: number
  readonly pan: Point
  readonly isPanning?: boolean
  readonly currentPolygon?: ReadonlyArray<Point>
  readonly history: ReadonlyArray<HistoryEntry>
  readonly historyIndex: number
  readonly contextMenu: ContextMenuState | null
  readonly measurements: MeasurementState
  readonly duplicatingElement?: {
    elementId: string
    elementType: 'room' | 'artwork'
    originalCenter: Point
    isValid: boolean
    validationMessage?: string
  } | null
}
