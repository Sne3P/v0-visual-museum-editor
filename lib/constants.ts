/**
 * Core constants for the Museum Floor Plan Editor
 * Centralized configuration for consistent behavior across components
 */

// === GRID & SNAPPING ===
export const GRID_SIZE = 40 // Base grid size in pixels
export const MAJOR_GRID_INTERVAL = 5 // Every 5th grid line is major
export const SNAP_THRESHOLD = 0.8 // Grid units for wall segment snapping
export const VERTEX_SNAP_THRESHOLD = 0.3 // Grid units for vertex snapping
export const POLYGON_CLOSE_THRESHOLD = 0.3 // Distance to close polygon

// === ZOOM & PAN ===
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 5.0
export const ZOOM_STEP = 1.1 // Multiplicative zoom factor
export const SMOOTH_ZOOM_DURATION = 150 // ms for smooth zoom animation

// === HIT DETECTION ===
export const VERTEX_HIT_RADIUS = 15 // Screen pixels - plus petit pour un design épuré
export const ENDPOINT_HIT_RADIUS = 15 // Screen pixels - plus petit pour un design épuré
export const LINE_HIT_THRESHOLD = 10 // Screen pixels for door/link bodies - réduit aussi
export const RESIZE_HANDLE_THRESHOLD = 0.3 // Grid units for artwork resize handles

// === VISUAL STYLING ===
export const COLORS = {
  // Modern color palette - Professional and cohesive
  primary: {
    50: "#f0f9ff",
    100: "#e0f2fe", 
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9", // Primary brand color
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e"
  },
  
  // Secondary palette for contrast
  secondary: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0", 
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a"
  },
  
  // Semantic colors
  success: {
    light: "#22c55e",
    default: "#16a34a", 
    dark: "#15803d"
  },
  
  warning: {
    light: "#f59e0b",
    default: "#d97706",
    dark: "#b45309"
  },
  
  danger: {
    light: "#f87171",
    default: "#dc2626", 
    dark: "#b91c1c"
  },
  
  // Grid - subtle and unobtrusive
  grid: "rgba(148, 163, 184, 0.2)", // secondary.400 with opacity
  gridMajor: "rgba(100, 116, 139, 0.3)", // secondary.500 with opacity
  
  // Room states - modern and cohesive
  roomDefault: "rgba(248, 250, 252, 0.95)", // secondary.50 
  roomSelected: "rgba(14, 165, 233, 0.12)", // primary.500 with low opacity
  roomHovered: "rgba(14, 165, 233, 0.06)", // primary.500 with very low opacity
  roomInvalid: "rgba(220, 38, 38, 0.12)", // danger.default with low opacity
  
  // Room strokes - clear hierarchy
  roomStrokeDefault: "#64748b", // secondary.500
  roomStrokeSelected: "#0ea5e9", // primary.500
  roomStrokeHovered: "#38bdf8", // primary.400
  roomStrokeInvalid: "#dc2626", // danger.default
  
  // Vertices - intuitive color coding
  vertexDefault: "#64748b", // secondary.500
  vertexSelected: "#0ea5e9", // primary.500
  vertexHovered: "#16a34a", // success.default
  
  // Artworks - subtle but distinct
  artworkDefault: "rgba(219, 234, 254, 0.85)", // Light blue tint
  artworkSelected: "rgba(14, 165, 233, 0.25)", // primary.500
  artworkHovered: "rgba(59, 130, 246, 0.2)",
  artworkInvalid: "rgba(239, 68, 68, 0.3)",
  artworkStroke: "#0ea5e9", // primary.500
  
  // Doors - distinctive and professional
  doorDefault: "#8b5cf6", // Purple for doors
  doorSelected: "#7c3aed",
  doorHovered: "#a78bfa",
  doorInvalid: "#dc2626", // danger.default
  
  // Stairs - green for movement up/down
  stairsDefault: "#16a34a", // success.default
  stairsSelected: "#15803d", // success.dark  
  stairsHovered: "#22c55e", // success.light
  stairsInvalid: "#dc2626", // danger.default
  
  // Elevators - red for mechanical transport
  elevatorDefault: "#dc2626", // danger.default
  elevatorSelected: "#b91c1c", // danger.dark
  elevatorHovered: "#f87171", // danger.light
  elevatorInvalid: "#dc2626", // danger.default

  
  // Validation feedback
  valid: "rgba(34, 197, 94, 0.6)",
  invalid: "rgba(239, 68, 68, 0.6)",
  validStroke: "rgb(34, 197, 94)",
  invalidStroke: "rgb(239, 68, 68)",
  
  // Selection
  selectionBox: "rgba(59, 130, 246, 0.1)",
  selectionStroke: "rgb(59, 130, 246)",
} as const

// === RENDERING ===
export const STROKE_WIDTHS = {
  gridMinor: 1,
  gridMajor: 1.5,
  roomDefault: 1.5,
  roomSelected: 2.5,
  roomHovered: 2,
  vertex: 2.5,
  artworkDefault: 1,
  artworkSelected: 2.5,
  artworkHovered: 2,
  doorDefault: 6, // Multiplied by zoom
  doorSelected: 9,
  doorHovered: 8,
  linkDefault: 8,
  linkSelected: 11,
  linkHovered: 10,
  selectionBox: 2,
} as const

export const VERTEX_RADIUS = {
  default: 6,
  selected: 8,
  hovered: 12,
} as const

export const ENDPOINT_RADIUS = {
  default: 8, // Multiplied by zoom
  hovered: 1.3, // Multiplier for hovered state
  glowRadius: 1.5, // Multiplier for glow effect
} as const

// === PERFORMANCE ===
export const RENDER_CONFIG = {
  useRequestAnimationFrame: true,
  maxHistorySize: 50, // Limit undo/redo history
  renderThrottleMs: 16, // ~60fps max
  dirtyFlagOptimization: true,
} as const

// === FONTS ===
export const FONTS = {
  iconSize: 14, // Base size, multiplied by zoom
  labelSize: 9,
  iconFamily: "sans-serif",
  labelFamily: "sans-serif",
} as const

// === GEOMETRY ===
export const GEOMETRY = {
  circleSegments: 32, // For circle polygon generation
  arcSegments: 24, // For arc polygon generation
  minPolygonVertices: 3,
  minRoomSize: 1, // Grid units
  maxRoomSize: 100, // Grid units
  minArtworkSize: 1, // Grid units  
  maxArtworkSize: 20, // Grid units
} as const

// === KEYBOARD SHORTCUTS ===
export const SHORTCUTS = {
  undo: ['ctrl+z', 'cmd+z'],
  redo: ['ctrl+y', 'cmd+y', 'ctrl+shift+z', 'cmd+shift+z'],
  delete: ['delete', 'backspace'],
  escape: ['escape'],
  selectAll: ['ctrl+a', 'cmd+a'],
  copy: ['ctrl+c', 'cmd+c'],
  paste: ['ctrl+v', 'cmd+v'],
  zoomIn: ['ctrl+=', 'cmd+=', 'ctrl+plus'],
  zoomOut: ['ctrl+-', 'cmd+-'],
  fitView: ['ctrl+0', 'cmd+0'],
} as const

// === VALIDATION ===
export const VALIDATION = {
  minDoorWidth: 0.5, // Grid units
  maxDoorWidth: 10,
  minLinkWidth: 0.5,
  maxLinkWidth: 15,
  roomOverlapTolerance: 0.01, // For floating point comparison
} as const