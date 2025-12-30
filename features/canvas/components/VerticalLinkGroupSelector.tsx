/**
 * MODAL DE SÉLECTION DE LIAISON VERTICAL LINK
 * Permet de choisir si on crée un nouveau groupe ou si on lie à un groupe existant
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { VerticalLink, Floor } from '@/core/entities'
import { getExistingLinksOnFloors, getVerticalLinkDisplayName, canLinkToGroup } from '@/core/services'

interface VerticalLinkGroupSelectorProps {
  type: 'stairs' | 'elevator'
  connectedFloorIds: readonly string[]
  floors: readonly Floor[]
  currentLinkGroupId?: string
  currentLinkNumber?: number
  onSelect: (groupInfo: { linkGroupId?: string; linkNumber?: number; isNewGroup: boolean }) => void
  onCancel: () => void
}

export function VerticalLinkGroupSelector({
  type,
  connectedFloorIds,
  floors,
  currentLinkGroupId,
  currentLinkNumber,
  onSelect,
  onCancel
}: VerticalLinkGroupSelectorProps) {
  // Pré-sélectionner le lien actuel en mode édition
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(() => {
    if (currentLinkGroupId) {
      // Trouver le premier lien avec ce groupId
      for (const floor of floors) {
        const link = floor.verticalLinks.find(vl => vl.linkGroupId === currentLinkGroupId)
        if (link) return link.id
      }
    }
    return null
  })

  // Récupérer les vertical links existants sur les étages connectés
  const existingLinks = getExistingLinksOnFloors(floors, connectedFloorIds, type)

  // Grouper par linkGroupId
  const linkGroups = new Map<string, Array<typeof existingLinks[0]>>()
  existingLinks.forEach(item => {
    const groupId = item.link.linkGroupId || item.link.id
    if (!linkGroups.has(groupId)) {
      linkGroups.set(groupId, [])
    }
    linkGroups.get(groupId)!.push(item)
  })

  // Créer un lien temporaire pour la validation
  const tempNewLink: VerticalLink = {
    id: 'temp-new-link',
    type,
    position: { x: 0, y: 0 },
    size: [1, 1] as const,
    floorId: connectedFloorIds[0] || '',
    connectedFloorIds: connectedFloorIds,
    roomId: undefined
  }

  const handleSelectNew = () => {
    onSelect({ isNewGroup: true })
  }

  const handleSelectExisting = () => {
    if (!selectedLinkId) return
    
    const selectedLink = existingLinks.find(item => item.link.id === selectedLinkId)?.link
    if (!selectedLink) return

    onSelect({
      linkGroupId: selectedLink.linkGroupId,
      linkNumber: selectedLink.linkNumber,
      isNewGroup: false
    })
  }

  const typeName = type === 'stairs' ? 'escalier' : 'ascenseur'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        <h2 className="text-lg font-semibold mb-4">
          Liaison {typeName}
        </h2>

        {linkGroups.size > 0 ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Des {typeName}s existent déjà sur les étages sélectionnés. Voulez-vous créer un nouveau {typeName} ou le lier à un existant ?
            </p>

            <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
              {Array.from(linkGroups.entries()).map(([groupId, links]) => {
                const firstLink = links[0].link
                const displayName = getVerticalLinkDisplayName(firstLink)
                
                // Vérifier si on peut lier à ce groupe
                const validation = canLinkToGroup(tempNewLink, groupId, floors)
                const isDisabled = !validation.canLink
                
                return (
                  <div 
                    key={groupId} 
                    className={`border rounded p-3 ${isDisabled ? 'opacity-50 bg-gray-50' : ''}`}
                  >
                    <label className={`flex items-start ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="linkGroup"
                        value={firstLink.id}
                        checked={selectedLinkId === firstLink.id}
                        onChange={(e) => setSelectedLinkId(e.target.value)}
                        disabled={isDisabled}
                        className="mt-1 mr-3"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{displayName}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Présent sur : {links.map(l => l.floorName).join(', ')}
                        </div>
                        {isDisabled && validation.reason && (
                          <div className="text-xs text-red-600 mt-1 font-medium">
                            ⚠ {validation.reason}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleSelectNew}
                variant="outline"
                className="flex-1"
              >
                Nouveau {typeName}
              </Button>
              <Button
                onClick={handleSelectExisting}
                disabled={!selectedLinkId}
                className="flex-1"
              >
                Lier à l'existant
              </Button>
              <Button onClick={onCancel} variant="outline">
                Annuler
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Aucun {typeName} n'existe sur les étages sélectionnés. Un nouveau {typeName} va être créé.
            </p>
            <div className="flex gap-3">
              <Button onClick={handleSelectNew} className="flex-1">
                Créer {typeName}
              </Button>
              <Button onClick={onCancel} variant="outline">
                Annuler
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
