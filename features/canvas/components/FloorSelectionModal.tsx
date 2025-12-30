/**
 * Modal de sélection d'étages pour liens verticaux
 * Permet de sélectionner plusieurs étages à connecter
 */

import { useState, useMemo } from 'react'
import type { Floor } from '@/core/entities'

interface FloorSelectionModalProps {
  floors: readonly Floor[]
  currentFloorId: string
  linkType: 'stairs' | 'elevator'
  mode?: 'create' | 'edit'
  currentConnectedFloorIds?: string[]
  onConfirm: (selectedFloorIds: string[], createAbove: boolean, createBelow: boolean) => void
  onCancel: () => void
}

export function FloorSelectionModal({
  floors,
  currentFloorId,
  linkType,
  mode = 'create',
  currentConnectedFloorIds,
  onConfirm,
  onCancel
}: FloorSelectionModalProps) {
  
  // Trouve l'index de l'étage actuel
  const currentFloorIndex = useMemo(() => 
    floors.findIndex(f => f.id === currentFloorId),
    [floors, currentFloorId]
  )

  // État : étages sélectionnés
  // En mode édition, commence avec les étages déjà connectés
  // En mode création, commence avec l'étage actuel
  const [selectedFloorIds, setSelectedFloorIds] = useState<Set<string>>(() => {
    if (mode === 'edit' && currentConnectedFloorIds) {
      return new Set(currentConnectedFloorIds)
    }
    return new Set([currentFloorId])
  })
  
  // État : création de nouveaux étages
  const [createAbove, setCreateAbove] = useState(false)
  const [createBelow, setCreateBelow] = useState(false)

  /**
   * Toggle sélection d'un étage
   */
  const toggleFloor = (floorId: string) => {
    setSelectedFloorIds(prev => {
      const newSet = new Set(prev)
      
      // En mode création, empêcher de désélectionner l'étage actuel
      if (mode === 'create' && floorId === currentFloorId) return prev
      
      if (newSet.has(floorId)) {
        newSet.delete(floorId)
      } else {
        newSet.add(floorId)
      }
      return newSet
    })
  }

  /**
   * Valide et ferme
   */
  const handleConfirm = () => {
    // Au moins 2 étages requis (ou 1 + création)
    const totalCount = selectedFloorIds.size + (createAbove ? 1 : 0) + (createBelow ? 1 : 0)
    if (totalCount < 2) {
      return
    }
    
    onConfirm(Array.from(selectedFloorIds), createAbove, createBelow)
  }

  const totalSelected = selectedFloorIds.size + (createAbove ? 1 : 0) + (createBelow ? 1 : 0)

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            linkType === 'stairs' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <span className="text-xl">
              {linkType === 'stairs' ? '↕' : '⬍'}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {linkType === 'stairs' ? 'Escalier' : 'Ascenseur'}
            </h2>
            <p className="text-sm text-gray-600">
              Sélectionnez les étages à connecter
            </p>
          </div>
        </div>

        {/* Liste des étages */}
        <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
          {/* Option: Créer nouvel étage au-dessus */}
          <label
            className={`
              flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all border-dashed
              ${createAbove 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }
            `}
          >
            <input
              type="checkbox"
              checked={createAbove}
              onChange={(e) => setCreateAbove(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">+ Créer étage au-dessus</span>
                <span className="text-xs text-blue-600">↑ Nouveau</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Un nouvel étage sera créé au-dessus
              </div>
            </div>
          </label>

          {floors.map((floor, index) => {
            const isCurrentFloor = floor.id === currentFloorId
            const isSelected = selectedFloorIds.has(floor.id)
            const isAbove = index > currentFloorIndex
            const isBelow = index < currentFloorIndex

            return (
              <label
                key={floor.id}
                className={`
                  flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }
                  ${isCurrentFloor ? 'ring-2 ring-green-400' : ''}
                `}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isCurrentFloor}
                  onChange={() => toggleFloor(floor.id)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{floor.name}</span>
                    {isCurrentFloor && (
                      <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                        Actuel
                      </span>
                    )}
                    {isAbove && !isCurrentFloor && (
                      <span className="text-xs text-blue-600">↑</span>
                    )}
                    {isBelow && (
                      <span className="text-xs text-orange-600">↓</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {floor.rooms.length} pièce{floor.rooms.length > 1 ? 's' : ''}
                  </div>
                </div>
              </label>
            )
          })}

          {/* Option: Créer nouvel étage en-dessous */}
          <label
            className={`
              flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all border-dashed
              ${createBelow 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }
            `}
          >
            <input
              type="checkbox"
              checked={createBelow}
              onChange={(e) => setCreateBelow(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">+ Créer étage en-dessous</span>
                <span className="text-xs text-orange-600">↓ Nouveau</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Un nouvel étage sera créé en-dessous
              </div>
            </div>
          </label>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>{totalSelected}</strong> étage{totalSelected > 1 ? 's' : ''} au total
            {totalSelected < 2 && (
              <span className="block mt-1 text-red-600 font-medium">
                ⚠ Minimum 2 étages requis
              </span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={totalSelected < 2}
            className={`
              flex-1 px-4 py-2 rounded-lg font-medium transition-colors
              ${totalSelected >= 2
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Créer
          </button>
        </div>
      </div>
    </div>
  )
}
