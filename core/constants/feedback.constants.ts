/**
 * FEEDBACK VISUEL ET MESSAGES
 */

export const VISUAL_FEEDBACK = {
  colors: {
    valid: "#22c55e",
    invalid: "#dc2626",
    warning: "#f59e0b",
    creating: "#3b82f6",
    moving: "#8b5cf6",
    resizing: "#06b6d4",
    neutral: "#6b7280",
  },
  
  opacity: {
    preview: 0.6,
    invalid: 0.3,
    disabled: 0.4,
  },
  
  stroke: {
    validThickness: 2,
    invalidThickness: 3,
    previewThickness: 2,
    selectedThickness: 3,
  },
  
  animation: {
    errorShakeDuration: 200,
    highlightFadeDuration: 300,
    transitionDuration: 150,
  }
} as const

export const ERROR_MESSAGES = {
  room: {
    tooSmall: "La pièce doit avoir une superficie minimum de {minArea} unités carrées",
    tooNarrow: "La pièce doit avoir une largeur minimum de {minWidth} unités",
    tooShort: "La pièce doit avoir une hauteur minimum de {minHeight} unités", 
    overlapping: "Les pièces ne peuvent pas se chevaucher",
    invalidShape: "La forme de la pièce n'est pas valide (auto-intersection)",
  },
  
  wall: {
    tooShort: "Le mur doit avoir une longueur minimum de {minLength} unités",
    outsideRoom: "Le mur doit être entièrement à l'intérieur d'une pièce",
    tooCloseToEdge: "Le mur est trop proche du bord de la pièce",
    intersectsOther: "Le mur ne peut pas croiser un autre mur",
  },
  
  artwork: {
    tooSmall: "L'œuvre doit avoir une taille minimum de {minWidth}×{minHeight}",
    tooBig: "L'œuvre dépasse la taille maximum autorisée",
    outsideRoom: "L'œuvre doit être placée à l'intérieur d'une pièce",
    tooCloseToWall: "L'œuvre est trop proche d'un mur",
  },
  
  general: {
    invalidOperation: "Opération non autorisée dans le contexte actuel",
    constraintViolation: "Cette action viole les contraintes de l'éditeur",
    geometryError: "Erreur de géométrie détectée",
  }
} as const
