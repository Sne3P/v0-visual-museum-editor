export type Tool =
  | "select"
  | "room"
  | "rectangle"
  | "circle"
  | "arc"
  | "triangle"
  | "artwork"
  | "door"
  | "stairs"
  | "elevator"

export interface Point {
  x: number
  y: number
}

export interface Room {
  id: string
  polygon: Point[]
}

export interface Artwork {
  id: string
  xy: [number, number]
  size?: [number, number]
  name?: string
  pdf_id?: string
}

export interface Door {
  id: string
  room_a: string
  room_b: string
  segment: [Point, Point] // start and end points of the door on the wall
  width: number // width in grid units
}

export interface VerticalLink {
  id: string
  type: "stairs" | "elevator"
  segment: [Point, Point] // start and end points on the wall
  width: number // width in grid units
  to_floor: string
  direction?: "up" | "down" | "both" // Added direction for stairs/elevator
}

export interface Floor {
  id: string
  name: string
  rooms: Room[]
  doors: Door[]
  artworks: Artwork[]
  verticalLinks: VerticalLink[]
}

export interface EditorState {
  floors: Floor[]
  currentFloorId: string
  selectedTool: Tool
  selectedElementId: string | null
  selectedElementType: "room" | "artwork" | "door" | "verticalLink" | null
  selectedElements: Array<{
    id: string
    type: "room" | "artwork" | "door" | "verticalLink" | "vertex"
    vertexIndex?: number
    roomId?: string
  }>
  gridSize: number
  zoom: number
  pan: Point
  isPanning: boolean
  currentPolygon: Point[]
  history: EditorState[]
  historyIndex: number
  contextMenu: {
    visible: boolean
    x: number
    y: number
    type: "element" | "background" | null
    elementId?: string
    elementType?: "room" | "door" | "verticalLink" | "artwork"
  } | null
}
