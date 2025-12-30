/**
 * POINT D'ENTRÉE HOOKS CANVAS
 * Hooks réutilisables pour le Canvas
 */

export * from './useZoomPan'              // Zoom & Pan (à utiliser dans Canvas)
export * from './useCanvasSelection'      // Sélection éléments (actif)
export * from './useBoxSelection'         // Box selection (actif)
export * from './useShapeCreation'        // Création formes géométriques (drag)
export * from './useFreeFormCreation'     // Création forme libre (point par point)
export * from './useWallCreation'         // Création murs intérieurs (drag)
export * from './useDoorCreation'         // Création portes (drag)
export * from './useVerticalLinkCreation' // Création liens verticaux (escaliers/ascenseurs)
export * from './useDoorSelection'        // Sélection et manipulation portes
export * from './useCanvasInteraction'    // Interactions utilisateur (clicks, pan)
export * from './useCanvasCoordinates'    // Coordonnées et zoom
export * from './useCanvasRender'         // Logique de rendu
export * from './useElementDrag'          // Déplacement éléments (Phase 2)
export * from './useVertexEdit'           // Édition vertices (Phase 2)
export * from './useVerticalLinkEdit'     // Édition vertices vertical links
export * from './useWallEndpointEdit'     // Édition endpoints murs
