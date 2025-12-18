/**
 * CONSTANTES POUR LE SYSTÈME D'HISTORIQUE
 * Configuration du système undo/redo
 */

export const HISTORY_CONFIG = {
  /**
   * Nombre maximum d'entrées dans l'historique
   * Au-delà, les plus anciennes sont supprimées
   */
  MAX_SIZE: 50,

  /**
   * Intervalle minimum entre deux entrées d'historique (ms)
   * Évite de saturer l'historique avec des modifications trop rapprochées
   * 500ms = actions espacées de plus d'une demi-seconde sont séparées
   */
  MIN_INTERVAL: 500,

  /**
   * Actions qui doivent toujours créer une nouvelle entrée (pas de merge)
   * Toutes les créations, suppressions, et actions structurelles
   */
  ALWAYS_NEW_ENTRY: [
    'Create room',
    'Create wall',
    'Create door',
    'Create artwork',
    'Create stairs',
    'Create elevator',
    'Delete room',
    'Delete wall',
    'Delete door',
    'Delete artwork',
    'Delete vertical link',
    'Delete elements',
    'Add floor',
    'Delete floor',
    'Paste',
    'Duplicate',
    'Dupliquer et placer',
    'Edit vertex',
    'Edit segment',
  ],
} as const

/**
 * Raccourcis clavier pour undo/redo
 */
export const HISTORY_SHORTCUTS = {
  undo: ['ctrl+z', 'cmd+z'],
  redo: ['ctrl+y', 'cmd+y', 'ctrl+shift+z', 'cmd+shift+z'],
} as const

/**
 * Messages d'action pour l'historique
 */
export const HISTORY_ACTIONS = {
  // Création
  CREATE_ROOM: 'Create room',
  CREATE_WALL: 'Create wall',
  CREATE_DOOR: 'Create door',
  CREATE_ARTWORK: 'Create artwork',
  CREATE_STAIRS: 'Create stairs',
  CREATE_ELEVATOR: 'Create elevator',
  CREATE_FLOOR: 'Add floor',

  // Modification
  MOVE_ROOM: 'Move room',
  MOVE_WALL: 'Move wall',
  MOVE_DOOR: 'Move door',
  MOVE_ARTWORK: 'Move artwork',
  MOVE_ELEMENTS: 'Move elements',
  EDIT_VERTEX: 'Edit vertex',
  EDIT_SEGMENT: 'Edit segment',
  RESIZE_ROOM: 'Resize room',
  RENAME_FLOOR: 'Rename floor',
  UPDATE_ARTWORK: 'Update artwork',

  // Suppression
  DELETE_ROOM: 'Delete room',
  DELETE_WALL: 'Delete wall',
  DELETE_DOOR: 'Delete door',
  DELETE_ARTWORK: 'Delete artwork',
  DELETE_VERTICAL_LINK: 'Delete vertical link',
  DELETE_FLOOR: 'Delete floor',
  DELETE_ELEMENTS: 'Delete elements',

  // Autre
  PASTE: 'Paste',
  DUPLICATE: 'Duplicate',
} as const

export type HistoryAction = typeof HISTORY_ACTIONS[keyof typeof HISTORY_ACTIONS]
