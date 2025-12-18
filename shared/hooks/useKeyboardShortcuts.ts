/**
 * HOOK CENTRALISÉ POUR TOUS LES RACCOURCIS CLAVIER
 * Gère tous les raccourcis de l'application de manière cohérente
 */

import { useEffect, useCallback } from 'react'
import type { EditorState, Tool } from '@/core/entities'

interface KeyboardShortcutsOptions {
  state: EditorState
  onUndo?: () => void
  onRedo?: () => void
  onSave?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onToolChange?: (tool: Tool) => void
  enabled?: boolean
}

/**
 * Hook pour gérer tous les raccourcis clavier de l'application
 */
export function useKeyboardShortcuts({
  state,
  onUndo,
  onRedo,
  onSave,
  onDelete,
  onDuplicate,
  onSelectAll,
  onDeselectAll,
  onCopy,
  onPaste,
  onToolChange,
  enabled = true
}: KeyboardShortcutsOptions) {
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ne pas intercepter si on est dans un input/textarea
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const alt = e.altKey

    // ========== HISTORIQUE ==========
    
    // Ctrl+Z : Undo
    if (ctrl && e.key === 'z' && !shift) {
      e.preventDefault()
      onUndo?.()
      return
    }

    // Ctrl+Shift+Z ou Ctrl+Y : Redo
    if ((ctrl && e.key === 'z' && shift) || (ctrl && e.key === 'y')) {
      e.preventDefault()
      onRedo?.()
      return
    }

    // ========== FICHIER ==========
    
    // Ctrl+S : Sauvegarder
    if (ctrl && e.key === 's') {
      e.preventDefault()
      onSave?.()
      return
    }

    // ========== ÉDITION ==========
    
    // Delete ou Backspace : Supprimer
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElements.length > 0) {
      e.preventDefault()
      onDelete?.()
      return
    }

    // Ctrl+D : Dupliquer
    if (ctrl && e.key === 'd' && state.selectedElements.length > 0) {
      e.preventDefault()
      onDuplicate?.()
      return
    }

    // Ctrl+C : Copier
    if (ctrl && e.key === 'c' && state.selectedElements.length > 0) {
      e.preventDefault()
      onCopy?.()
      return
    }

    // Ctrl+V : Coller
    if (ctrl && e.key === 'v') {
      e.preventDefault()
      onPaste?.()
      return
    }

    // Ctrl+A : Tout sélectionner
    if (ctrl && e.key === 'a') {
      e.preventDefault()
      onSelectAll?.()
      return
    }

    // Escape : Désélectionner
    if (e.key === 'Escape') {
      e.preventDefault()
      onDeselectAll?.()
      return
    }

    // ========== OUTILS ==========
    
    // V : Outil Sélection
    if (e.key === 'v' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('select')
      return
    }

    // R : Outil Rectangle
    if (e.key === 'r' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('rectangle')
      return
    }

    // C : Outil Cercle
    if (e.key === 'c' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('circle')
      return
    }

    // T : Outil Triangle
    if (e.key === 't' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('triangle')
      return
    }

    // A : Outil Arc
    if (e.key === 'a' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('arc')
      return
    }

    // P : Outil Forme Libre (Polygon/Room)
    if (e.key === 'p' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('room')
      return
    }

    // W : Outil Mur (Wall)
    if (e.key === 'w' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('wall')
      return
    }

    // D : Outil Porte (Door)
    if (e.key === 'd' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('door')
      return
    }

    // O : Outil Œuvre (Art Object)
    if (e.key === 'o' && !ctrl && !shift && !alt) {
      e.preventDefault()
      onToolChange?.('artwork')
      return
    }

  }, [
    state.selectedElements.length,
    onUndo,
    onRedo,
    onSave,
    onDelete,
    onDuplicate,
    onSelectAll,
    onDeselectAll,
    onCopy,
    onPaste,
    onToolChange
  ])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}
