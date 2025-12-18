'use client'

import { useCallback } from 'react'
import { X } from 'lucide-react'
import type { EditorState, Room, Artwork, Floor } from '@/core/entities'

interface PropertiesModalProps {
  isOpen: boolean
  elementType?: 'room' | 'artwork' | 'wall' | 'door' | 'verticalLink'
  elementId?: string
  state: EditorState
  currentFloor: Floor
  updateState: (updates: Partial<EditorState>) => void
  onClose: () => void
}

export function PropertiesModal({
  isOpen,
  elementType,
  elementId,
  state,
  currentFloor,
  updateState,
  onClose
}: PropertiesModalProps) {
  if (!isOpen || !elementType || !elementId) return null

  let element: Room | Artwork | null = null
  let title = ''

  if (elementType === 'room') {
    element = currentFloor.rooms.find(r => r.id === elementId) ?? null
    title = 'Propriétés - Pièce'
  } else if (elementType === 'artwork') {
    element = (currentFloor.artworks || []).find(a => a.id === elementId) ?? null
    title = 'Propriétés - Œuvre'
  }

  if (!element) return null

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-96 max-h-96 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {elementType === 'room' && element && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID Pièce
                </label>
                <input
                  type="text"
                  value={elementId}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de sommets
                </label>
                <input
                  type="number"
                  value={(element as Room).polygon.length}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coordonnées (premier sommet)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={Math.round((element as Room).polygon[0]?.x || 0)}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                    placeholder="X"
                  />
                  <input
                    type="number"
                    value={Math.round((element as Room).polygon[0]?.y || 0)}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                    placeholder="Y"
                  />
                </div>
              </div>
            </div>
          )}

          {elementType === 'artwork' && element && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID Œuvre
                </label>
                <input
                  type="text"
                  value={elementId}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={Math.round((element as Artwork).xy[0])}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                    placeholder="X"
                  />
                  <input
                    type="number"
                    value={Math.round((element as Artwork).xy[1])}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm"
                    placeholder="Y"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50 font-medium text-sm"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
