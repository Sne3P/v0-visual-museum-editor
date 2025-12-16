/**
 * CONSTANTES DE CONTRAINTES PROFESSIONNELLES
 */

export const CONSTRAINTS = {
  room: {
    minArea: 1.0,
    minWidth: 0.5,
    minHeight: 0.5,
    minPerimeter: 2.0,
    maxAspectRatio: 10.0,
  },
  
  wall: {
    minLength: 0.2,
    maxLength: 100.0,
    minDistanceFromEdge: 0.05,
    snapTolerance: 0.4,
  },
  
  artwork: {
    minWidth: 0.1,
    minHeight: 0.1,
    maxWidth: 20.0,
    maxHeight: 20.0,
    minDistanceFromWall: 0.05,
  },
  
  door: {
    minWidth: 0.3,
    maxWidth: 12.0,
    minClearance: 0.1,
    snapTolerance: 0.3,
  },
  
  verticalLink: {
    minWidth: 0.4,
    maxWidth: 15.0,
    minClearance: 0.15,
    snapTolerance: 0.3,
  },
  
  overlap: {
    tolerance: 1e-3,
    bufferZone: 0.02,
    allowTouching: true,
    allowSharedEdges: true,
  },
  
  creation: {
    minDragDistance: 0.1,  // R\u00e9duit pour preview plus rapide (0.1 = 5cm)
    snapTolerance: 0.4,
    gridSnapForce: false,
    intelligentSnap: true,
  },
  
  movement: {
    maintainAspectRatio: false, 
    preserveWallConnections: true,
    allowPartialOverlap: false,
    smartCollisionDetection: true,
    adaptiveSnap: true,
  },
  
  snap: {
    maxDistance: 0.5,
    priorityVertex: 15,
    priorityWall: 10,
    priorityGrid: 5,
    priorityIntersection: 20,
    magnetism: 0.8,
    cascadeSnap: true,
  }
} as const
