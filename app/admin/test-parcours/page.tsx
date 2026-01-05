'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ArrowRight, Loader2, MapPin, Clock, Route } from 'lucide-react'

interface ParcoursArtwork {
  order: number
  oeuvre_id: number
  title: string
  artist: string
  date: string
  materiaux_technique: string
  position: {
    x: number
    y: number
    room: number
    floor: number
  }
  narration: string
  narration_word_count: number
  distance_to_next: number
}

interface ParcoursResult {
  parcours_id: string
  profil: {
    age_cible: string
    thematique: string
    style_texte: string
  }
  metadata: {
    artwork_count: number
    total_distance_meters: number
    total_duration_minutes: number
    floors_visited: number
    rooms_visited: number
    target_duration_minutes?: number
    duration_breakdown?: {
      total_minutes: number
      walking_minutes: number
      narration_minutes: number
      observation_minutes: number
      breakdown: Array<{
        oeuvre_id: number
        title: string
        narration_minutes: number
        observation_minutes: number
        walking_to_next_minutes: number
      }>
    }
  }
  artworks: ParcoursArtwork[]
}

export default function TestParcoursPage() {
  const [loading, setLoading] = useState(false)
  const [parcours, setParcours] = useState<ParcoursResult | null>(null)
  const [selectedNarration, setSelectedNarration] = useState<ParcoursArtwork | null>(null)
  
  // Options de profil
  const [ageCible, setAgeCible] = useState('adulte')
  const [thematique, setThematique] = useState('technique_picturale')
  const [styleTexte, setStyleTexte] = useState('analyse')
  const [targetDuration, setTargetDuration] = useState(60) // Durée cible en minutes

  const ageOptions = [
    { value: 'enfant', label: '👶 Enfant (6-10 ans)' },
    { value: 'ado', label: '🧑 Ado (11-17 ans)' },
    { value: 'adulte', label: '👤 Adulte' },
    { value: 'senior', label: '👴 Senior' }
  ]

  const themeOptions = [
    { value: 'technique_picturale', label: '🎨 Technique Picturale' },
    { value: 'biographie', label: '👨‍🎨 Biographie' },
    { value: 'historique', label: '📜 Historique' }
  ]

  const styleOptions = [
    { value: 'analyse', label: '🔍 Analyse' },
    { value: 'decouverte', label: '✨ Découverte' },
    { value: 'anecdote', label: '📖 Anecdote' }
  ]

  async function generateParcours() {
    setLoading(true)
    setParcours(null)
    
    try {
      const backendUrl = 'http://localhost:5000/api/parcours/generate'
      console.log('🔄 Appel API parcours:', backendUrl)
      
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age_cible: ageCible,
          thematique: thematique,
          style_texte: styleTexte,
          target_duration_minutes: targetDuration
        })
      })

      console.log('📡 Réponse reçue:', response.status, response.statusText)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.success) {
        setParcours(data.parcours)
      } else {
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`)
      }
    } catch (error: any) {
      console.error('Erreur génération parcours:', error)
      alert(`Erreur: ${error.message}`)
    }
    
    setLoading(false)
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 pb-20">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">🗺️ Test Générateur de Parcours</h1>
          <p className="text-gray-600">
            Générez un parcours personnalisé en fonction du profil visiteur
          </p>
        </div>

        {/* Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>⚙️ Configuration du Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Âge cible */}
              <div>
                <Label className="mb-2 block">Âge Cible</Label>
                <div className="space-y-2">
                  {ageOptions.map(option => (
                    <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="age"
                        value={option.value}
                        checked={ageCible === option.value}
                        onChange={(e) => setAgeCible(e.target.value)}
                        className="w-4 h-4"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Thématique */}
              <div>
                <Label className="mb-2 block">Thématique</Label>
                <div className="space-y-2">
                  {themeOptions.map(option => (
                    <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        value={option.value}
                        checked={thematique === option.value}
                        onChange={(e) => setThematique(e.target.value)}
                        className="w-4 h-4"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <Label className="mb-2 block">Style de Texte</Label>
                <div className="space-y-2">
                  {styleOptions.map(option => (
                    <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="style"
                        value={option.value}
                        checked={styleTexte === option.value}
                        onChange={(e) => setStyleTexte(e.target.value)}
                        className="w-4 h-4"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Durée cible */}
              <div>
                <Label htmlFor="targetDuration" className="mb-2 block">
                  ⏱️ Durée Cible (minutes)
                </Label>
                <select
                  id="targetDuration"
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {[15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180].map(duration => (
                    <option key={duration} value={duration}>
                      {duration} min {duration >= 60 ? `(${(duration / 60).toFixed(1)}h)` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Paliers de 15 minutes</p>
              </div>
            </div>

            <div className="mt-6">
              <Button
                onClick={generateParcours}
                disabled={loading}
                className="w-full md:w-auto"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Route className="mr-2 h-4 w-4" />
                    Générer le Parcours
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Résultats */}
        {parcours && (
          <div className="space-y-6">
            {/* Métadonnées */}
            <Card>
              <CardHeader>
                <CardTitle>📊 Résumé du Parcours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {parcours.metadata.artwork_count}
                    </div>
                    <div className="text-sm text-gray-600">Œuvres</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {parcours.metadata.total_distance_meters.toFixed(0)}m
                    </div>
                    <div className="text-sm text-gray-600">Distance</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {parcours.metadata.total_duration_minutes} min
                    </div>
                    <div className="text-sm text-gray-600">Durée Totale</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {parcours.metadata.floors_visited}
                    </div>
                    <div className="text-sm text-gray-600">Étages</div>
                  </div>
                  <div className="text-center p-4 bg-pink-50 rounded-lg">
                    <div className="text-2xl font-bold text-pink-600">
                      {parcours.metadata.rooms_visited}
                    </div>
                    <div className="text-sm text-gray-600">Salles</div>
                  </div>
                </div>

                {/* Détail des temps */}
                {parcours.metadata.duration_breakdown && (
                  <div className="border-t pt-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Décomposition du Temps
                      {parcours.metadata.target_duration_minutes && (
                        <span className="text-sm text-gray-600 font-normal">
                          (Cible: {parcours.metadata.target_duration_minutes} min)
                        </span>
                      )}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <div className="text-lg font-bold text-blue-800">
                          {parcours.metadata.duration_breakdown.walking_minutes.toFixed(1)} min
                        </div>
                        <div className="text-sm text-blue-600">🚶 Marche (0.8 m/s)</div>
                      </div>
                      <div className="p-3 bg-green-100 rounded-lg">
                        <div className="text-lg font-bold text-green-800">
                          {parcours.metadata.duration_breakdown.narration_minutes.toFixed(1)} min
                        </div>
                        <div className="text-sm text-green-600">🎧 Narration (120 mots/min)</div>
                      </div>
                      <div className="p-3 bg-purple-100 rounded-lg">
                        <div className="text-lg font-bold text-purple-800">
                          {parcours.metadata.duration_breakdown.observation_minutes.toFixed(1)} min
                        </div>
                        <div className="text-sm text-purple-600">👁️ Observation (2 min/œuvre)</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Parcours détaillé */}
            <Card>
              <CardHeader>
                <CardTitle>🎯 Parcours Détaillé</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {parcours.artworks.map((artwork, idx) => {
                    const detail = parcours.metadata.duration_breakdown?.breakdown?.[idx]
                    return (
                    <div key={artwork.oeuvre_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                              {artwork.order}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg">{artwork.title}</h3>
                              <p className="text-sm text-gray-600">{artwork.artist} • {artwork.date}</p>
                            </div>
                          </div>

                          <div className="flex gap-4 text-sm text-gray-600 mb-3">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              Salle {artwork.position.room} • Étage {artwork.position.floor}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {artwork.narration_word_count} mots
                            </div>
                            {detail && (
                              <div className="flex items-center gap-1 text-purple-600 font-medium">
                                ⏱️ {(
                                  detail.narration_minutes +
                                  detail.observation_minutes +
                                  (detail.walking_to_next_minutes || 0)
                                ).toFixed(1)} min
                              </div>
                            )}
                          </div>

                          {/* Détail temps par œuvre */}
                          {detail && (
                            <div className="mb-3 p-2 bg-gray-50 rounded text-xs text-gray-600 flex gap-3">
                              <span>🎧 Narr: {detail.narration_minutes.toFixed(1)}min</span>
                              <span>👁️ Obs: {detail.observation_minutes.toFixed(1)}min</span>
                              {detail.walking_to_next_minutes > 0 && (
                                <span>🚶 Marche: {detail.walking_to_next_minutes.toFixed(1)}min</span>
                              )}
                            </div>
                          )}

                          <p className="text-sm text-gray-700 line-clamp-2">
                            {artwork.narration.substring(0, 150)}...
                          </p>

                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => setSelectedNarration(artwork)}
                          >
                            Lire la narration complète
                          </Button>
                        </div>
                      </div>

                      {idx < parcours.artworks.length - 1 && (
                        <div className="mt-4 pt-4 border-t flex items-center gap-2 text-sm text-gray-500">
                          <ArrowRight className="h-4 w-4" />
                          <span>Distance suivante: {artwork.distance_to_next.toFixed(1)}m</span>
                        </div>
                      )}
                    </div>
                    )})}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Modal narration */}
        {selectedNarration && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b">
                <h3 className="text-xl font-bold mb-1">{selectedNarration.title}</h3>
                <p className="text-gray-600">{selectedNarration.artist}</p>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {selectedNarration.narration}
                </p>
              </div>

              <div className="p-4 border-t bg-gray-50 flex justify-end">
                <Button onClick={() => setSelectedNarration(null)}>
                  Fermer
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
