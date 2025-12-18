/**
 * ✅ CONSTANTES POUR LE MENU CONTEXTUEL
 * Actions disponibles pour chaque type d'élément
 * 
 * TRADUCTION: Tout en français
 * ICÔNES: SVG réutilisables au lieu d'emojis
 */

import type { ElementType, ContextMenuAction } from '@/core/entities'

/**
 * Actions communes à tous les éléments
 * Simplifié: propriétés seulement pour les formes
 */
export const COMMON_ACTIONS = {
  SUPPRIMER: 'supprimer',
  DUPLIQUER: 'dupliquer',
} as const

/**
 * Actions spécifiques aux pièces
 */
export const ROOM_ACTIONS = {
  ...COMMON_ACTIONS,
  PROPRIETES: 'proprietes',
} as const

/**
 * Actions spécifiques aux murs
 * Simplifié: supprimer et dupliquer seulement
 */
export const WALL_ACTIONS = {
  ...COMMON_ACTIONS,
} as const

/**
 * Actions spécifiques aux portes
 * Simplifié: supprimer et dupliquer seulement
 */
export const DOOR_ACTIONS = {
  ...COMMON_ACTIONS,
} as const

/**
 * Actions spécifiques aux œuvres d'art
 * Simplifié: supprimer et dupliquer seulement
 */
export const ARTWORK_ACTIONS = {
  ...COMMON_ACTIONS,
} as const

/**
 * Actions spécifiques aux liens verticaux
 * Simplifié: supprimer et dupliquer seulement
 */
export const VERTICAL_LINK_ACTIONS = {
  ...COMMON_ACTIONS,
} as const

/**
 * Actions spécifiques aux vertices
 * Simplifié: seulement supprimer (copier et propriétés inutiles)
 */
export const VERTEX_ACTIONS = {
  SUPPRIMER: 'supprimer',
} as const

/**
 * Actions spécifiques aux segments
 */
export const SEGMENT_ACTIONS = {
  SUPPRIMER: 'supprimer',
  DIVISER: 'diviser',
  AJOUTER_VERTEX: 'ajouter_vertex',
} as const

/**
 * Actions pour le fond (canvas)
 */
export const BACKGROUND_ACTIONS = {
  COLLER: 'coller',
  ZOOM_AVANT: 'zoom_avant',
  ZOOM_ARRIERE: 'zoom_arriere',
  AJUSTER_VUE: 'ajuster_vue',
  REINITIALISER_ZOOM: 'reinitialiser_zoom',
  ACTUALISER: 'actualiser',
} as const

/**
 * Icônes pour chaque action (noms Lucide)
 */
export const ACTION_ICONS: Record<string, string> = {
  supprimer: 'Trash2',
  dupliquer: 'Copy',
  proprietes: 'Settings',
  diviser: 'Scissors',
  ajouter_vertex: 'Plus',
  zoom_avant: 'ZoomIn',
  zoom_arriere: 'ZoomOut',
  ajuster_vue: 'Maximize',
  reinitialiser_zoom: 'RotateCcw',
  actualiser: 'RefreshCw',
  coller: 'ClipboardPaste',
} as const

/**
 * Labels lisibles pour chaque action
 */
export const ACTION_LABELS: Record<string, string> = {
  supprimer: 'Supprimer',
  dupliquer: 'Dupliquer',
  proprietes: 'Propriétés',
  diviser: 'Diviser',
  ajouter_vertex: 'Ajouter un sommet',
  zoom_avant: 'Agrandir',
  zoom_arriere: 'Réduire',
  ajuster_vue: 'Ajuster à la vue',
  reinitialiser_zoom: 'Réinitialiser le zoom',
  actualiser: 'Actualiser',
  coller: 'Coller',
} as const

/**
 * Raccourcis clavier pour chaque action
 */
export const ACTION_SHORTCUTS: Record<string, string> = {
  supprimer: 'Suppr',
  dupliquer: 'Ctrl+D',
  copier: 'Ctrl+C',
  coller: 'Ctrl+V',
  zoom_avant: '+',
  zoom_arriere: '-',
  reinitialiser_zoom: '0',
} as const

/**
 * Obtenir les actions disponibles pour un type d'élément
 */
export function getActionsForElementType(
  type: ElementType | 'vertex' | 'segment' | 'background'
): ContextMenuAction[] {
  switch (type) {
    case 'room':
      return Object.values(ROOM_ACTIONS) as ContextMenuAction[]
    case 'wall':
      return Object.values(WALL_ACTIONS) as ContextMenuAction[]
    case 'door':
      return Object.values(DOOR_ACTIONS) as ContextMenuAction[]
    case 'artwork':
      return Object.values(ARTWORK_ACTIONS) as ContextMenuAction[]
    case 'verticalLink':
      return Object.values(VERTICAL_LINK_ACTIONS) as ContextMenuAction[]
    case 'vertex':
      return Object.values(VERTEX_ACTIONS) as ContextMenuAction[]
    case 'segment':
      return Object.values(SEGMENT_ACTIONS) as ContextMenuAction[]
    case 'background':
      return Object.values(BACKGROUND_ACTIONS) as ContextMenuAction[]
    default:
      return []
  }
}
