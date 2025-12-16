/**
 * Badge de validation pour indiquer l'état de cohérence de l'éditeur
 * Affiche : Cohérent / Non cohérent / Warnings
 */

import { useMemo } from 'react'
import type { EditorState, Floor } from '@/core/entities'
import { validateRoomGeometry } from '@/core/services'
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'

interface ValidationBadgeProps {
  state: EditorState
  currentFloor: Floor
  className?: string
}

interface ValidationSummary {
  status: 'valid' | 'warning' | 'error'
  message: string
  errorCount: number
  warningCount: number
  details: string[]
}

export function ValidationBadge({ state, currentFloor, className = '' }: ValidationBadgeProps) {
  // Calculer l'état de validation global
  const validation = useMemo((): ValidationSummary => {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Valider toutes les pièces du floor actuel
    for (const room of currentFloor.rooms) {
      const roomValidation = validateRoomGeometry(room, {
        floor: currentFloor,
        strictMode: true,
        allowWarnings: false
      })

      if (!roomValidation.valid) {
        if (roomValidation.severity === 'error') {
          errors.push(`Pièce ${room.id.slice(0, 8)} : ${roomValidation.message}`)
        } else if (roomValidation.severity === 'warning') {
          warnings.push(`Pièce ${room.id.slice(0, 8)} : ${roomValidation.message}`)
        }
      }
    }

    // 2. Valider les murs (TODO : si implémenté)
    // for (const wall of currentFloor.walls) { ... }

    // 3. Valider les artworks (TODO : si implémenté)
    // for (const artwork of currentFloor.artworks) { ... }

    // 4. Déterminer le statut global
    let status: 'valid' | 'warning' | 'error' = 'valid'
    let message = 'Cohérent'

    if (errors.length > 0) {
      status = 'error'
      message = `Non cohérent (${errors.length} erreur${errors.length > 1 ? 's' : ''})`
    } else if (warnings.length > 0) {
      status = 'warning'
      message = `Attention (${warnings.length} alerte${warnings.length > 1 ? 's' : ''})`
    }

    return {
      status,
      message,
      errorCount: errors.length,
      warningCount: warnings.length,
      details: [...errors, ...warnings]
    }
  }, [currentFloor])

  // Styles selon le statut
  const statusStyles = {
    valid: {
      bg: 'bg-green-500/10 hover:bg-green-500/20',
      border: 'border-green-500/30',
      text: 'text-green-600',
      icon: CheckCircle2
    },
    warning: {
      bg: 'bg-amber-500/10 hover:bg-amber-500/20',
      border: 'border-amber-500/30',
      text: 'text-amber-600',
      icon: AlertTriangle
    },
    error: {
      bg: 'bg-red-500/10 hover:bg-red-500/20',
      border: 'border-red-500/30',
      text: 'text-red-600',
      icon: AlertCircle
    }
  }

  const style = statusStyles[validation.status]
  const Icon = style.icon

  return (
    <div
      className={`
        group relative inline-flex items-center gap-2 
        px-4 py-2 rounded-lg border-2 
        transition-all duration-200 cursor-help
        ${style.bg} ${style.border} ${style.text}
        ${className}
      `}
      title={validation.details.length > 0 ? validation.details.join('\n') : 'Aucune erreur détectée'}
    >
      {/* Icône */}
      <Icon className="w-5 h-5" />
      
      {/* Message */}
      <span className="font-semibold text-sm">
        {validation.message}
      </span>

      {/* Tooltip détaillé au hover */}
      {validation.details.length > 0 && (
        <div className="
          absolute top-full left-0 mt-2 
          w-80 p-3 rounded-lg shadow-xl 
          bg-gray-900 text-white text-xs
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-all duration-200 z-50
          pointer-events-none
        ">
          <div className="font-bold mb-2">Détails de validation :</div>
          <ul className="space-y-1 list-disc list-inside">
            {validation.details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
          
          {/* Flèche vers le haut */}
          <div className="
            absolute -top-1 left-4 
            w-2 h-2 rotate-45 
            bg-gray-900
          " />
        </div>
      )}
    </div>
  )
}
