/**
 * SERVICE D'HISTORIQUE CENTRALISÉ
 * Gestion complète du système undo/redo avec optimisations
 */

import type { EditorState, HistoryEntry } from '@/core/entities'
import { HISTORY_CONFIG, HISTORY_ACTIONS, type HistoryAction } from '@/core/constants'

/**
 * Créer une nouvelle entrée d'historique
 */
export function createHistoryEntry(
  state: EditorState,
  description: HistoryAction | string,
  timestamp = Date.now()
): HistoryEntry {
  return {
    state,
    description,
    timestamp,
  }
}

/**
 * Ajouter une entrée à l'historique avec optimisations
 * - Limite la taille de l'historique
 * - Évite les entrées trop rapprochées (merge si possible)
 * - Coupe l'historique au point actuel si on fait une nouvelle action après undo
 */
export function addToHistory(
  currentState: EditorState,
  newState: EditorState,
  description: HistoryAction | string
): { history: HistoryEntry[]; historyIndex: number } {
  const now = Date.now()
  
  // Couper l'historique au point actuel (supprime le "futur" après undo)
  const history = currentState.history.slice(0, currentState.historyIndex + 1)
  
  // Vérifier si on doit merger avec l'entrée précédente
  const lastEntry = history[history.length - 1]
  const shouldMerge =
    lastEntry &&
    lastEntry.description === description &&
    now - lastEntry.timestamp < HISTORY_CONFIG.MIN_INTERVAL &&
    !HISTORY_CONFIG.ALWAYS_NEW_ENTRY.includes(description as any)
  
  if (shouldMerge) {
    // Mettre à jour l'entrée existante au lieu de créer une nouvelle
    // On garde le timestamp original pour éviter de merger indéfiniment
    history[history.length - 1] = createHistoryEntry(newState, description, lastEntry.timestamp)
    return {
      history,
      historyIndex: history.length - 1,
    }
  }
  
  // Créer nouvelle entrée avec le NOUVEL état (pas l'ancien!)
  const newEntry = createHistoryEntry(newState, description, now)
  history.push(newEntry)
  
  // Limiter la taille de l'historique
  if (history.length > HISTORY_CONFIG.MAX_SIZE) {
    history.shift()
    return {
      history,
      historyIndex: history.length - 1,
    }
  }
  
  return {
    history,
    historyIndex: history.length - 1,
  }
}

/**
 * Undo : Revenir à l'état précédent
 */
export function undo(currentState: EditorState): EditorState | null {
  if (currentState.historyIndex <= 0) {
    return null // Pas d'historique précédent
  }
  
  const previousEntry = currentState.history[currentState.historyIndex - 1]
  
  return {
    ...previousEntry.state,
    history: currentState.history,
    historyIndex: currentState.historyIndex - 1,
  }
}

/**
 * Redo : Revenir à l'état suivant
 */
export function redo(currentState: EditorState): EditorState | null {
  if (currentState.historyIndex >= currentState.history.length - 1) {
    return null // Pas d'historique suivant
  }
  
  const nextEntry = currentState.history[currentState.historyIndex + 1]
  
  return {
    ...nextEntry.state,
    history: currentState.history,
    historyIndex: currentState.historyIndex + 1,
  }
}

/**
 * Vérifier si undo est possible
 */
export function canUndo(state: EditorState): boolean {
  return state.historyIndex > 0
}

/**
 * Vérifier si redo est possible
 */
export function canRedo(state: EditorState): boolean {
  return state.historyIndex < state.history.length - 1
}

/**
 * Obtenir la description de l'action undo
 */
export function getUndoDescription(state: EditorState): string | null {
  if (!canUndo(state)) return null
  return state.history[state.historyIndex - 1].description
}

/**
 * Obtenir la description de l'action redo
 */
export function getRedoDescription(state: EditorState): string | null {
  if (!canRedo(state)) return null
  return state.history[state.historyIndex + 1].description
}

/**
 * Réinitialiser l'historique (pour nouveau projet ou chargement)
 */
export function resetHistory(state: EditorState): EditorState {
  const initialEntry = createHistoryEntry(state, 'Initial state')
  
  return {
    ...state,
    history: [initialEntry],
    historyIndex: 0,
  }
}

/**
 * Obtenir des statistiques sur l'historique (debug/dev)
 */
export function getHistoryStats(state: EditorState) {
  return {
    size: state.history.length,
    currentIndex: state.historyIndex,
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    actions: state.history.map((entry, index) => ({
      index,
      description: entry.description,
      timestamp: new Date(entry.timestamp).toLocaleTimeString(),
      isCurrent: index === state.historyIndex,
    })),
  }
}
