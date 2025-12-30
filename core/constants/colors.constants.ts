/**
 * PALETTE DE COULEURS MODERNE ET COHÉRENTE
 */

export const COLORS = {
  primary: {
    50: "#f0f9ff",
    100: "#e0f2fe", 
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e"
  },
  
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
  
  grid: "rgba(148, 163, 184, 0.2)",
  gridMajor: "rgba(100, 116, 139, 0.3)",
  
  roomDefault: "rgba(248, 250, 252, 0.95)",
  roomSelected: "rgba(14, 165, 233, 0.12)",
  roomHovered: "rgba(14, 165, 233, 0.06)",
  roomInvalid: "rgba(220, 38, 38, 0.12)",
  
  roomStrokeDefault: "#64748b",
  roomStrokeSelected: "#0ea5e9",
  roomStrokeHovered: "#38bdf8",
  roomStrokeInvalid: "#dc2626",
  
  vertexDefault: "#64748b",
  vertexSelected: "#0ea5e9",
  vertexHovered: "#16a34a",
  
  artworkDefault: "rgba(219, 234, 254, 0.85)",
  artworkSelected: "rgba(14, 165, 233, 0.25)",
  artworkHovered: "rgba(59, 130, 246, 0.2)",
  artworkInvalid: "rgba(239, 68, 68, 0.3)",
  artworkStroke: "#0ea5e9",
  
  doorDefault: "#8b5cf6",
  doorSelected: "#7c3aed",
  doorHovered: "#a78bfa",
  doorInvalid: "#dc2626",
  
  stairsDefault: "#16a34a",
  stairsSelected: "#15803d",  
  stairsHovered: "#f59e0b",
  elevatorDefault: "#dc2626",
  elevatorSelected: "#b91c1c",
  elevatorHovered: "#f59e0b",
  elevatorInvalid: "#dc2626",

  wallDefault: "#374151",
  wallSelected: "#1f2937",
  wallHovered: "#4b5563",
  wallInvalid: "#dc2626",
  
  valid: "rgba(34, 197, 94, 0.6)",
  invalid: "rgba(239, 68, 68, 0.6)",
  validStroke: "rgb(34, 197, 94)",
  invalidStroke: "rgb(239, 68, 68)",
  
  measurementText: "#1f2937",
  measurementBackground: "rgba(255, 255, 255, 0.9)",
  measurementBorder: "#9ca3af",
  areaText: "#065f46",
  areaBackground: "rgba(16, 185, 129, 0.1)",
  
  selectionBox: "rgba(59, 130, 246, 0.1)",
  selectionStroke: "rgb(59, 130, 246)",
} as const

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
  doorDefault: 6,
  doorSelected: 9,
  doorHovered: 8,
  linkDefault: 8,
  linkSelected: 11,
  linkHovered: 10,
  wallDefault: 4,
  wallSelected: 6,
  wallHovered: 5,
  selectionBox: 2,
} as const

export const VERTEX_RADIUS = {
  default: 6,
  selected: 8,
  hovered: 12,
} as const

export const ENDPOINT_RADIUS = {
  default: 8,
  hovered: 1.3,
  glowRadius: 1.5,
} as const
