/**
 * ✅ CONTEXT MENU COMPONENT
 * 
 * Menu contextuel réutilisable (clic droit)
 * - Positionné à la souris
 * - Actions selon type d'élément
 * - Icônes Lucide + raccourcis clavier
 * - Auto-fermeture sur clic ailleurs
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ContextMenuAction } from '@/core/entities'
import { ACTION_ICONS, ACTION_LABELS, ACTION_SHORTCUTS } from '@/core/constants'
import * as LucideIcons from 'lucide-react'

export interface ContextMenuProps {
  x: number
  y: number
  actions: ContextMenuAction[]
  onAction: (action: ContextMenuAction) => void
  onClose: () => void
}

// Mapper les noms d'icônes aux composants Lucide
const getIcon = (iconName: string): React.ComponentType<any> | null => {
  const icon = (LucideIcons as any)[iconName]
  return icon || null
}

export function ContextMenu({ 
  x, 
  y, 
  actions, 
  onAction, 
  onClose 
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Ajuster position si déborde de l'écran
  useEffect(() => {
    if (!menuRef.current) return
    
    const rect = menuRef.current.getBoundingClientRect()
    const adjustedX = x + rect.width > window.innerWidth ? x - rect.width : x
    const adjustedY = y + rect.height > window.innerHeight ? y - rect.height : y
    
    menuRef.current.style.left = `${adjustedX}px`
    menuRef.current.style.top = `${adjustedY}px`
  }, [x, y])
  
  // Fermer sur Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])
  
  // Fermer sur clic ailleurs
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    
    // Délai pour éviter fermeture immédiate au clic d'ouverture
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside)
    }, 100)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleClickOutside)
    }
  }, [onClose])
  
  const handleAction = (action: ContextMenuAction) => {
    console.log('🔘 CONTEXTMENU COMPONENT: Bouton cliqué:', action)
    onAction(action)
    onClose()
  }
  
  // Séparer les actions en groupes (par séparateurs)
  const groupActions = (actions: ContextMenuAction[]) => {
    const groups: ContextMenuAction[][] = []
    let currentGroup: ContextMenuAction[] = []
    
    actions.forEach(action => {
      if (action === 'separator') {
        if (currentGroup.length > 0) {
          groups.push(currentGroup)
          currentGroup = []
        }
      } else {
        currentGroup.push(action)
      }
    })
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }
    
    return groups
  }
  
  const actionGroups = groupActions(actions)
  
  // Couleurs selon l'action
  const getActionColor = (action: ContextMenuAction): string => {
    if (action === 'supprimer') return 'text-red-600 hover:bg-red-50'
    return 'text-gray-700 hover:bg-gray-100'
  }
  
  return (
    <div
      ref={menuRef}
      data-context-menu
      className="fixed z-9999 min-w-60 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
      style={{ left: x, top: y }}
    >
      {actionGroups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {groupIndex > 0 && (
            <div className="h-px bg-gray-200 my-1" />
          )}
          
          {group.map((action) => {
            const iconName = ACTION_ICONS[action as keyof typeof ACTION_ICONS]
            const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS]
            const shortcut = ACTION_SHORTCUTS[action as keyof typeof ACTION_SHORTCUTS]
            const colorClass = getActionColor(action)
            const IconComponent = getIcon(iconName)
            
            return (
              <button
                key={action}
                onClick={() => handleAction(action)}
                className={`
                  w-full px-3 py-2 text-left text-sm 
                  flex items-center justify-between gap-3
                  transition-colors duration-150
                  ${colorClass}
                `}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {IconComponent ? (
                    <IconComponent className="shrink-0 w-4 h-4" />
                  ) : null}
                  <span className="truncate">{label}</span>
                </span>
                
                {shortcut && (
                  <span className="text-xs text-gray-400 font-mono shrink-0 ml-2">
                    {shortcut}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
