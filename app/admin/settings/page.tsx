"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Clock, Building2 } from 'lucide-react'
import type { OpeningHours, MuseumSetting } from '@/core/entities/museum-settings.types'

export default function SystemSettingsPage() {
  const { isAuthenticated, hasPermission } = useAuth()
  const router = useRouter()
  const [settings, setSettings] = useState<MuseumSetting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [museumName, setMuseumName] = useState('')
  const [openingHours, setOpeningHours] = useState<OpeningHours>({})
  const [centresInterets, setCentresInterets] = useState<string[]>([])
  const [mouvementsPreferes, setMouvementsPreferes] = useState<string[]>([])


  const daysOfWeek = [
    { key: 'lundi', label: 'Lundi' },
    { key: 'mardi', label: 'Mardi' },
    { key: 'mercredi', label: 'Mercredi' },
    { key: 'jeudi', label: 'Jeudi' },
    { key: 'vendredi', label: 'Vendredi' },
    { key: 'samedi', label: 'Samedi' },
    { key: 'dimanche', label: 'Dimanche' }
  ]

  useEffect(() => {
    if (!isAuthenticated || !hasPermission('system_settings')) {
      router.push('/admin')
      return
    }
    loadSettings()
  }, [isAuthenticated, hasPermission, router])

  // Initialiser les horaires par défaut si vides
  useEffect(() => {
    if (Object.keys(openingHours).length === 0) {
      const defaultHours = {
        lundi: { open: '09:00', close: '18:00', closed: false },
        mardi: { open: '09:00', close: '18:00', closed: false },
        mercredi: { open: '09:00', close: '18:00', closed: false },
        jeudi: { open: '09:00', close: '18:00', closed: false },
        vendredi: { open: '09:00', close: '18:00', closed: false },
        samedi: { open: '10:00', close: '19:00', closed: false },
        dimanche: { open: '10:00', close: '18:00', closed: false }
      }
      setOpeningHours(defaultHours)
    }
  }, [openingHours])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/museum-settings')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
        
        // Extraire les valeurs spécifiques
        data.forEach((setting: MuseumSetting) => {
          switch (setting.setting_key) {
            case 'museum_name':
              setMuseumName(setting.setting_value)
              break
            case 'opening_hours':
              setOpeningHours(setting.setting_value)
              break
            case 'centres_interets':
              try {
                setCentresInterets(Array.isArray(setting.setting_value) ? setting.setting_value : JSON.parse(setting.setting_value))
              } catch {
                setCentresInterets([])
              }
              break
            case 'mouvements_preferes':
              try {
                setMouvementsPreferes(Array.isArray(setting.setting_value) ? setting.setting_value : JSON.parse(setting.setting_value))
              } catch {
                setMouvementsPreferes([])
              }
              break
          }
        })
      }
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error)
    }
    setIsLoading(false)
  }

  const handleSaveMuseumName = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/museum-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          setting_key: 'museum_name',
          setting_value: museumName,
        }),
      })

      if (response.ok) {
        console.log('Nom du musée sauvegardé')
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
    }
    setIsSaving(false)
  }

  const handleSaveOpeningHours = async () => {
    setIsSaving(true)
    try {
      console.log('Sauvegarde des horaires:', openingHours)
      
      const response = await fetch('/api/museum-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          setting_key: 'opening_hours',
          setting_value: openingHours,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Horaires sauvegardés avec succès:', result)
        alert('Horaires d\'ouverture sauvegardés avec succès!')
      } else {
        const error = await response.text()
        console.error('Erreur API:', error)
        alert('Erreur lors de la sauvegarde des horaires')
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Erreur de connexion lors de la sauvegarde')
    }
    setIsSaving(false)
  }



  const updateOpeningHours = (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setOpeningHours(prev => ({
      ...prev,
      [day]: {
        open: prev[day]?.open || '09:00',
        close: prev[day]?.close || '18:00',
        closed: prev[day]?.closed || false,
        ...prev[day],
        [field]: value
      }
    }))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 overflow-y-auto">
      <div className="container mx-auto p-6 max-w-4xl pb-20">
        {/* Header */}
        <div className="relative flex justify-center mb-8">
          <Button 
            variant="outline" 
            onClick={() => router.push('/admin')}
            className="absolute left-0 top-0 flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Paramètres Système</h1>
            <p className="text-gray-600 mt-1">Configurer les paramètres globaux du musée</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Nom du musée */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle>Informations générales</CardTitle>
                <CardDescription>Nom et identité du musée</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="museum_name">Nom du musée</Label>
                <div className="flex gap-2">
                  <Input
                    id="museum_name"
                    value={museumName}
                    onChange={(e) => setMuseumName(e.target.value)}
                    placeholder="Nom du musée"
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSaveMuseumName} 
                    disabled={isSaving}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Sauvegarder
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Horaires d'ouverture */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Clock className="h-5 w-5 text-green-600" />
              <div>
                <CardTitle>Horaires d'ouverture</CardTitle>
                <CardDescription>Configurez les horaires d'ouverture et de fermeture</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {daysOfWeek.map(({ key, label }) => (
                <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 border rounded-lg">
                  <div className="w-full sm:w-20 font-medium">{label}</div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={openingHours[key]?.closed || false}
                        onChange={(e) => updateOpeningHours(key, 'closed', e.target.checked)}
                        className="mr-2"
                      />
                      <Label className="text-sm text-gray-600">Fermé</Label>
                    </div>
                    
                    {!openingHours[key]?.closed && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Ouverture:</Label>
                          <Input
                            type="time"
                            value={openingHours[key]?.open || '09:00'}
                            onChange={(e) => updateOpeningHours(key, 'open', e.target.value)}
                            className="w-32"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Fermeture:</Label>
                          <Input
                            type="time"
                            value={openingHours[key]?.close || '18:00'}
                            onChange={(e) => updateOpeningHours(key, 'close', e.target.value)}
                            className="w-32"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleSaveOpeningHours} 
                  disabled={isSaving}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Sauvegarder les horaires
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Résumé des paramètres */}
          <Card>
            <CardHeader>
              <CardTitle>Résumé des paramètres</CardTitle>
              <CardDescription>Vue d'ensemble de la configuration actuelle</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div>
                  <span className="font-medium">Nom du musée:</span> {museumName}
                </div>
              </div>
              <div className="mt-4">
                <span className="font-medium">Horaires d'ouverture:</span>
                <div className="mt-2 text-sm space-y-1">
                  {daysOfWeek.map(({ key, label }) => {
                    const hours = openingHours[key]
                    return (
                      <div key={key} className="flex justify-between">
                        <span>{label}:</span>
                        <span>
                          {hours?.closed ? 'Fermé' : `${hours?.open || '09:00'} - ${hours?.close || '18:00'}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>



      {/* Section Résumé */}
      <div className="bg-gray-50 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-semibold text-center mb-6">Résumé de la Configuration</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Informations générales</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <div><strong>Nom du musée:</strong> {museumName || 'Non défini'}</div>
              <div><strong>Horaires configurés:</strong> {Object.keys(openingHours).length} jour(s)</div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Statut du système</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <div><strong>Paramètres chargés:</strong> {settings.length} éléments</div>
              <div><strong>Dernière mise à jour:</strong> En temps réel</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}