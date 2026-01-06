/**
 * Types pour la gestion des thématiques du musée
 */

export interface ThemeItem {
  name: string
  description?: string
  aiIndication?: string
  image?: string
}

export interface ThemeState {
  items: ThemeItem[]
}

export interface CentreInteret extends ThemeItem {
  // Centre d'intérêt peut avoir des propriétés supplémentaires
}

export interface MouvementArtistique extends ThemeItem {
  // Mouvement artistique peut avoir des propriétés supplémentaires
}

export interface ThematiquesData {
  centresInterets: ThemeItem[]
  mouvementsPreferes: ThemeItem[]
  themes?: ThemeItem[]
}

export interface UploadThemeImageResponse {
  success: boolean
  imageUrl?: string
  fileName?: string
  size?: number
  type?: string
  error?: string
}
