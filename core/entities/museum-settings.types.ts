/**
 * Types pour les paramètres du musée
 */

export interface OpeningHours {
  [day: string]: {
    open: string
    close: string
    closed: boolean
  }
}

export interface MuseumSetting {
  setting_id: number
  setting_key: string
  setting_value: any
  description: string | null
  category: string
  created_at: string
  updated_at: string
}

export type MuseumSettingKey = 
  | 'museum_name'
  | 'opening_hours'
  | 'timezone'
  | 'centres_interets'
  | 'mouvements_preferes'

export type MuseumSettingCategory = 
  | 'general'
  | 'schedule'
  | 'themes'
  | 'custom'

export interface MuseumSettingInput {
  setting_key: MuseumSettingKey | string
  setting_value: any
  description?: string
  category?: MuseumSettingCategory
}

export interface MuseumSettingUpdate {
  setting_key: MuseumSettingKey | string
  setting_value: any
}
