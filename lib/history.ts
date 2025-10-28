import type { EditorState, Floor, Point, ElementType } from './types'
import { RENDER_CONFIG } from './constants'

/**
 * Represents a change in the editor state
 */
export interface HistoryPatch {
  readonly id: string
  readonly timestamp: number
  readonly type: 'create' | 'update' | 'delete' | 'batch'
  readonly description: string
  readonly changes: ReadonlyArray<StateChange>
}

export interface StateChange {
  readonly path: string // JSONPath-like string: "floors.0.rooms.2.polygon"
  readonly oldValue: unknown
  readonly newValue: unknown
  readonly elementType?: ElementType
  readonly elementId?: string
}

/**
 * Optimized history manager using patches instead of full state snapshots
 */
export class HistoryManager {
  private patches: HistoryPatch[] = []
  private currentIndex = -1
  private readonly maxSize: number

  constructor(maxSize = RENDER_CONFIG.maxHistorySize) {
    this.maxSize = maxSize
  }

  /**
   * Add a new patch to history
   */
  push(patch: HistoryPatch): void {
    // Remove any redo history when pushing new changes
    this.patches = this.patches.slice(0, this.currentIndex + 1)
    
    // Add new patch
    this.patches.push(patch)
    this.currentIndex++

    // Maintain max size
    if (this.patches.length > this.maxSize) {
      this.patches.shift()
      this.currentIndex--
    }
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.currentIndex >= 0
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.currentIndex < this.patches.length - 1
  }

  /**
   * Get the current patch for undo
   */
  getCurrentPatch(): HistoryPatch | null {
    return this.patches[this.currentIndex] || null
  }

  /**
   * Get the next patch for redo
   */
  getNextPatch(): HistoryPatch | null {
    return this.patches[this.currentIndex + 1] || null
  }

  /**
   * Move to previous state (undo)
   */
  undo(): HistoryPatch | null {
    if (!this.canUndo()) return null
    
    const patch = this.patches[this.currentIndex]
    this.currentIndex--
    return patch
  }

  /**
   * Move to next state (redo)
   */
  redo(): HistoryPatch | null {
    if (!this.canRedo()) return null
    
    this.currentIndex++
    return this.patches[this.currentIndex]
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.patches = []
    this.currentIndex = -1
  }

  /**
   * Get history size
   */
  size(): number {
    return this.patches.length
  }

  /**
   * Get current position in history
   */
  position(): number {
    return this.currentIndex
  }
}

/**
 * Create a patch from state changes
 */
export function createPatch(
  type: HistoryPatch['type'],
  description: string,
  changes: StateChange[]
): HistoryPatch {
  return {
    id: `patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    type,
    description,
    changes: Object.freeze(changes)
  }
}

/**
 * Apply a patch to state (for redo)
 */
export function applyPatch(state: EditorState, patch: HistoryPatch): EditorState {
  let newState = { ...state }
  
  for (const change of patch.changes) {
    newState = setDeepValue(newState, change.path, change.newValue)
  }
  
  return newState
}

/**
 * Reverse a patch on state (for undo)
 */
export function reversePatch(state: EditorState, patch: HistoryPatch): EditorState {
  let newState = { ...state }
  
  // Apply changes in reverse order
  for (let i = patch.changes.length - 1; i >= 0; i--) {
    const change = patch.changes[i]
    newState = setDeepValue(newState, change.path, change.oldValue)
  }
  
  return newState
}

/**
 * Create a state change for tracking differences
 */
export function createStateChange(
  path: string,
  oldValue: unknown,
  newValue: unknown,
  elementType?: ElementType,
  elementId?: string
): StateChange {
  return {
    path,
    oldValue,
    newValue,
    elementType,
    elementId
  }
}

/**
 * Detect changes between two states and create a patch
 */
export function diffStates(
  oldState: EditorState,
  newState: EditorState,
  description: string
): HistoryPatch | null {
  const changes: StateChange[] = []
  
  // Compare floors
  if (oldState.floors !== newState.floors) {
    // For now, we'll track floor-level changes
    // In a more sophisticated system, we'd deep-diff the floors
    changes.push(createStateChange(
      'floors',
      oldState.floors,
      newState.floors
    ))
  }
  
  // Compare other state properties
  const simpleProps: (keyof EditorState)[] = [
    'currentFloorId',
    'selectedTool', 
    'selectedElementId',
    'selectedElementType',
    'selectedElements',
    'zoom',
    'pan',
    'currentPolygon'
  ]
  
  for (const prop of simpleProps) {
    if (oldState[prop] !== newState[prop]) {
      changes.push(createStateChange(
        prop,
        oldState[prop],
        newState[prop]
      ))
    }
  }
  
  if (changes.length === 0) return null
  
  return createPatch('update', description, changes)
}

/**
 * Set a deep value in an object using a path
 */
function setDeepValue(obj: any, path: string, value: unknown): any {
  const keys = path.split('.')
  let current = { ...obj }
  let target = current
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextKey = keys[i + 1]
    
    if (!(key in target)) {
      target[key] = isNaN(Number(nextKey)) ? {} : []
    } else {
      target[key] = Array.isArray(target[key]) ? [...target[key]] : { ...target[key] }
    }
    
    target = target[key]
  }
  
  target[keys[keys.length - 1]] = value
  return current
}

/**
 * Create patches for common operations
 */
export const PatchOperations = {
  createRoom: (floorId: string, room: any): HistoryPatch => 
    createPatch('create', `Create room ${room.id}`, [
      createStateChange(`floors.${floorId}.rooms`, null, room, 'room', room.id)
    ]),
    
  updateRoom: (floorId: string, roomId: string, oldRoom: any, newRoom: any): HistoryPatch =>
    createPatch('update', `Update room ${roomId}`, [
      createStateChange(`floors.${floorId}.rooms.${roomId}`, oldRoom, newRoom, 'room', roomId)
    ]),
    
  deleteRoom: (floorId: string, roomId: string, room: any): HistoryPatch =>
    createPatch('delete', `Delete room ${roomId}`, [
      createStateChange(`floors.${floorId}.rooms.${roomId}`, room, null, 'room', roomId)
    ]),
    
  createArtwork: (floorId: string, artwork: any): HistoryPatch =>
    createPatch('create', `Create artwork ${artwork.id}`, [
      createStateChange(`floors.${floorId}.artworks`, null, artwork, 'artwork', artwork.id)
    ]),
    
  moveElement: (elementType: ElementType, elementId: string, oldPos: Point, newPos: Point): HistoryPatch =>
    createPatch('update', `Move ${elementType} ${elementId}`, [
      createStateChange(`${elementType}.${elementId}.position`, oldPos, newPos, elementType, elementId)
    ])
} as const