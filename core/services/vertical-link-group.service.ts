/**
 * SERVICE DE GESTION DES GROUPES DE VERTICAL LINKS
 * Gère la numérotation et les liaisons entre escaliers/ascenseurs sur différents étages
 */

import type { VerticalLink, Floor } from '@/core/entities'
import { v4 as uuidv4 } from 'uuid'

/**
 * Obtenir le prochain numéro disponible pour un type de vertical link
 */
export function getNextLinkNumber(floors: readonly Floor[], type: 'stairs' | 'elevator'): number {
  let maxNumber = 0
  
  floors.forEach(floor => {
    floor.verticalLinks?.forEach(link => {
      if (link.type === type && link.linkNumber !== undefined) {
        maxNumber = Math.max(maxNumber, link.linkNumber)
      }
    })
  })
  
  return maxNumber + 1
}

/**
 * Obtenir tous les vertical links existants d'un type sur les étages connectés
 */
export function getExistingLinksOnFloors(
  floors: readonly Floor[],
  connectedFloorIds: readonly string[],
  type: 'stairs' | 'elevator'
): Array<{
  link: VerticalLink
  floorId: string
  floorName: string
}> {
  const existingLinks: Array<{
    link: VerticalLink
    floorId: string
    floorName: string
  }> = []

  connectedFloorIds.forEach(floorId => {
    const floor = floors.find(f => f.id === floorId)
    if (!floor) return

    floor.verticalLinks?.forEach(link => {
      if (link.type === type) {
        existingLinks.push({
          link,
          floorId: floor.id,
          floorName: floor.name
        })
      }
    })
  })

  return existingLinks
}

/**
 * Vérifier si un vertical link peut être lié à un groupe existant
 * Contraintes:
 * 1. Ne pas lier à soi-même
 * 2. Types compatibles (escalier ≠ ascenseur)
 * 3. Pas deux liens du même étage dans un groupe (physiquement impossible)
 * 4. Pas de conflit multi-lien (plusieurs liens d'un étage vers un seul lien d'un autre)
 */
export function canLinkToGroup(
  newLink: VerticalLink,
  groupId: string,
  floors: readonly Floor[]
): { canLink: boolean; reason?: string } {
  // Récupérer tous les links du groupe
  const groupLinks: VerticalLink[] = []
  floors.forEach(floor => {
    floor.verticalLinks?.forEach(link => {
      if (link.linkGroupId === groupId) {
        groupLinks.push(link)
      }
    })
  })

  if (groupLinks.length === 0) {
    return { canLink: false, reason: 'Groupe introuvable' }
  }

  // CONTRAINTE 1: Ne pas lier à soi-même
  if (groupLinks.some(link => link.id === newLink.id)) {
    return { canLink: false, reason: 'Impossible de lier un lien à lui-même' }
  }

  // CONTRAINTE 2: Vérifier le type (escalier ne peut pas se lier à ascenseur)
  const groupType = groupLinks[0].type
  if (newLink.type !== groupType) {
    return {
      canLink: false,
      reason: `Impossible de lier un ${newLink.type === 'stairs' ? 'escalier' : 'ascenseur'} avec un ${groupType === 'stairs' ? 'escalier' : 'ascenseur'}`
    }
  }

  // CONTRAINTE 3: Pas deux liens du même étage dans le groupe
  const groupFloorIds = groupLinks.map(link => link.floorId)
  if (groupFloorIds.includes(newLink.floorId)) {
    return {
      canLink: false,
      reason: 'Un autre lien de ce groupe existe déjà sur cet étage'
    }
  }

  // CONTRAINTE 4: Vérifier les connexions - pas de conflit multi-lien
  // Pour chaque étage, vérifier qu'il n'y a qu'un seul lien physique du groupe
  const linksByFloor = new Map<string, VerticalLink[]>()
  
  // Ajouter le nouveau lien
  if (!linksByFloor.has(newLink.floorId)) {
    linksByFloor.set(newLink.floorId, [])
  }
  linksByFloor.get(newLink.floorId)!.push(newLink)
  
  // Ajouter les liens existants du groupe
  groupLinks.forEach(link => {
    if (!linksByFloor.has(link.floorId)) {
      linksByFloor.set(link.floorId, [])
    }
    linksByFloor.get(link.floorId)!.push(link)
  })

  // Vérifier qu'il n'y a qu'un seul lien physique par étage
  for (const [floorId, links] of linksByFloor.entries()) {
    if (links.length > 1) {
      return {
        canLink: false,
        reason: 'Plusieurs liens du même groupe ne peuvent pas être sur le même étage'
      }
    }
  }

  // Vérifier la cohérence des connexions entre étages
  // Tous les liens du groupe doivent connecter des étages compatibles
  const allConnectedFloors = new Set<string>()
  
  // Ajouter les connexions du nouveau lien
  allConnectedFloors.add(newLink.floorId)
  newLink.connectedFloorIds.forEach(id => allConnectedFloors.add(id))
  
  // Ajouter les connexions des liens du groupe
  groupLinks.forEach(link => {
    allConnectedFloors.add(link.floorId)
    link.connectedFloorIds.forEach(id => allConnectedFloors.add(id))
  })

  // Vérifier que le nouveau lien partage au moins un étage avec le groupe
  const newLinkFloors = new Set([newLink.floorId, ...newLink.connectedFloorIds])
  const groupFloors = new Set<string>()
  groupLinks.forEach(link => {
    groupFloors.add(link.floorId)
    link.connectedFloorIds.forEach(id => groupFloors.add(id))
  })

  const hasSharedFloor = Array.from(newLinkFloors).some(id => groupFloors.has(id))
  if (!hasSharedFloor) {
    return {
      canLink: false,
      reason: 'Le nouveau lien doit connecter au moins un étage en commun avec le groupe'
    }
  }

  return { canLink: true }
}

/**
 * Créer un nouveau groupe de vertical links
 */
export function createNewLinkGroup(
  link: VerticalLink,
  floors: readonly Floor[]
): { linkGroupId: string; linkNumber: number } {
  const linkGroupId = uuidv4()
  const linkNumber = getNextLinkNumber(floors, link.type)
  
  return { linkGroupId, linkNumber }
}

/**
 * Lier un vertical link à un groupe existant
 */
export function linkToExistingGroup(
  link: VerticalLink,
  targetLink: VerticalLink
): { linkGroupId: string; linkNumber: number } {
  return {
    linkGroupId: targetLink.linkGroupId || uuidv4(),
    linkNumber: targetLink.linkNumber || 1
  }
}

/**
 * Obtenir le nom d'affichage d'un vertical link
 */
export function getVerticalLinkDisplayName(link: VerticalLink): string {
  if (!link.linkNumber) return link.type === 'stairs' ? 'Escalier' : 'Ascenseur'
  
  const baseName = link.type === 'stairs' ? 'Escalier' : 'Ascenseur'
  return `${baseName} ${link.linkNumber}`
}

/**
 * Obtenir tous les vertical links d'un même groupe
 */
export function getLinksInGroup(
  groupId: string,
  floors: readonly Floor[]
): Array<{ link: VerticalLink; floor: Floor }> {
  const groupLinks: Array<{ link: VerticalLink; floor: Floor }> = []

  floors.forEach(floor => {
    floor.verticalLinks?.forEach(link => {
      if (link.linkGroupId === groupId) {
        groupLinks.push({ link, floor })
      }
    })
  })

  return groupLinks
}
