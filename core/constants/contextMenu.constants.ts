/**
 * CONSTANTES MENU CONTEXTUEL - VERSION OPTIMISÉE
 * Métadonnées unifiées et actions sans doublons
 */

import type { ElementType, ContextMenuAction } from '@/core/entities'

/**
 * Métadonnées complètes pour chaque action (icône + label + raccourci)
 */
interface ActionMeta {
  icon: string
  label: string
  shortcut?: string
}

export const ACTION_METADATA: Record<string, ActionMeta> = {
  supprimer: { icon: 'Trash2', label: 'Supprimer', shortcut: 'Suppr' },
  dupliquer: { icon: 'Copy', label: 'Dupliquer', shortcut: 'Ctrl+D' },
  copier: { icon: 'Copy', label: 'Copier', shortcut: 'Ctrl+C' },
  coller: { icon: 'ClipboardPaste', label: 'Coller', shortcut: 'Ctrl+V' },
  proprietes: { icon: 'Settings', label: 'Propriétés' },
  diviser: { icon: 'Scissors', label: 'Diviser' },
  ajouter_vertex: { icon: 'Plus', label: 'Ajouter un sommet' },
  zoom_avant: { icon: 'ZoomIn', label: 'Agrandir', shortcut: '+' },
  zoom_arriere: { icon: 'ZoomOut', label: 'Réduire', shortcut: '-' },
  ajuster_vue: { icon: 'Maximize', label: 'Ajuster à la vue' },
  reinitialiser_zoom: { icon: 'RotateCcw', label: 'Réinitialiser le zoom', shortcut: '0' },
  actualiser: { icon: 'RefreshCw', label: 'Actualiser' },
} as const

// Compatibilité : exports séparés pour le code existant
export const ACTION_ICONS = Object.fromEntries(
  Object.entries(ACTION_METADATA).map(([k, v]) => [k, v.icon])
) as Record<string, string>

export const ACTION_LABELS = Object.fromEntries(
  Object.entries(ACTION_METADATA).map(([k, v]) => [k, v.label])
) as Record<string, string>

export const ACTION_SHORTCUTS = Object.fromEntries(
  Object.entries(ACTION_METADATA)
    .filter(([_, v]) => v.shortcut)
    .map(([k, v]) => [k, v.shortcut!])
) as Record<string, string>

/**
 * Actions par type d'élément (mapping compact)
 */
const ACTIONS_MAP: Record<string, ContextMenuAction[]> = {
  room: ['supprimer', 'dupliquer', 'proprietes'],
  wall: ['supprimer', 'dupliquer'],
  door: ['supprimer', 'dupliquer'],
  artwork: ['supprimer', 'dupliquer'],
  verticalLink: ['supprimer', 'dupliquer'],
  vertex: ['supprimer'],
  segment: ['supprimer', 'diviser', 'ajouter_vertex'],
  background: ['coller', 'zoom_avant', 'zoom_arriere', 'ajuster_vue', 'reinitialiser_zoom', 'actualiser'],
}

/**
 * Obtenir les actions disponibles pour un type d'élément
 */
export function getActionsForElementType(
  type: ElementType | 'vertex' | 'segment' | 'background'
): ContextMenuAction[] {
  return (ACTIONS_MAP[type] || []) as ContextMenuAction[]
}
