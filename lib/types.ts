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
export type HoverElementType = ElementType | "vertex" | "doorEndpoint" | "linkEndpoint" | "wallEndpoint"

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface Room {
  readonly id: string
  readonly polygon: ReadonlyArray<Point>
}

export interface Artwork {
  readonly id: string
  readonly xy: readonly [number, number]
  readonly size?: readonly [number, number]
  readonly name?: string
  readonly pdf_id?: string
}

export interface Door {
  readonly id: string
  readonly room_a: string
  readonly room_b: string
  readonly segment: readonly [Point, Point] // start and end points of the door on the wall
  readonly width: number // width in grid units
}

export interface VerticalLink {
  readonly id: string
  readonly type: "stairs" | "elevator"
  readonly segment: readonly [Point, Point] // start and end points on the wall
  readonly width: number // width in grid units
  readonly to_floor: string
  readonly direction?: "up" | "down" | "both"
}

export interface Escalator {
  readonly id: string
  readonly startPosition: Point
  readonly endPosition: Point
  readonly fromFloorId: string
  readonly toFloorId: string
  readonly direction: "up" | "down"
  readonly width: number
}

export interface Elevator {
  readonly id: string
  readonly position: Point
  readonly size: number
  readonly connectedFloorIds: string[]
}

export interface Wall {
  readonly id: string
  readonly segment: readonly [Point, Point] // start and end points of the wall
  readonly thickness: number // thickness in grid units (usually 0.1-0.3)
  readonly roomId?: string // optional: which room this wall belongs to
  readonly isLoadBearing?: boolean // for structural significance
}

// Improved drag state types
export interface DragState {
  readonly type: DragElementType
  readonly originalData: Room | Artwork | Door | VerticalLink | VertexDragData
}

export interface VertexDragData {
  readonly roomId: string
  readonly polygon: ReadonlyArray<Point>
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
}

export interface SelectionInfo {
  readonly id: string
  readonly type: ElementType | "vertex"
  readonly vertexIndex?: number
  readonly roomId?: string
}

export interface WallSnap {
  readonly point: Point
  readonly segmentStart: Point
  readonly segmentEnd: Point
  readonly distance: number
}

export interface CreationPreview {
  readonly start: Point
  readonly end: Point
  readonly valid: boolean
  readonly tool: Tool
}

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

export interface ViewState {
  readonly zoom: number
  readonly pan: Point
  readonly isPanning: boolean
}

export interface ContextMenuState {
  readonly visible: boolean
  readonly x: number
  readonly y: number
  readonly type: "element" | "background" | null
  readonly elementId?: string
  readonly elementType?: ElementType
}

export interface EditorState {
  readonly floors: ReadonlyArray<Floor>
  readonly currentFloorId: string
  readonly selectedTool: Tool
  readonly selectedElementId: string | null
  readonly selectedElementType: ElementType | null
  readonly selectedElements: ReadonlyArray<SelectionInfo>
  readonly gridSize: number
  readonly zoom: number
  readonly pan: Point
  readonly isPanning: boolean
  readonly currentPolygon: ReadonlyArray<Point>
  readonly history: ReadonlyArray<EditorState>
  readonly historyIndex: number
  readonly contextMenu: ContextMenuState | null
}

// Helper types for operations
export interface GeometryOperation<TInput, TOutput> {
  readonly input: TInput
  readonly output: TOutput
  readonly valid: boolean
  readonly message?: string
}

export interface ValidationResult {
  readonly valid: boolean
  readonly message?: string
  readonly suggestions?: string[]
}

export interface RenderLayer {
  readonly name: string
  readonly zIndex: number
  readonly dirty: boolean
  readonly lastRender: number
}
