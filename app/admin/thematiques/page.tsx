'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Save, Palette, Plus, X, ArrowLeft, Image, Upload } from 'lucide-react'
import type { MuseumSetting } from '@/core/entities/museum-settings.types'
import type { ThemeItem, ThemeState } from '@/core/entities/thematiques.types'

const DEFAULT_IMAGES = {
  centres: [
    '/api/placeholder/64/64?text=Art',
    '/api/placeholder/64/64?text=Culture', 
    '/api/placeholder/64/64?text=Histoire',
    '/api/placeholder/64/64?text=Nature',
    '/api/placeholder/64/64?text=Science'
  ],
  mouvements: [
    '/api/placeholder/64/64?text=Classique',
    '/api/placeholder/64/64?text=Moderne',
    '/api/placeholder/64/64?text=Contemp',
    '/api/placeholder/64/64?text=Baroque',
    '/api/placeholder/64/64?text=Gothic'
  ]
}

export default function ThematiquesPage() {
  const { isAuthenticated, hasPermission } = useAuth()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // État pour les thématiques
  const [centresInterets, setCentresInterets] = useState<ThemeItem[]>([])
  const [mouvementsPreferes, setMouvementsPreferes] = useState<ThemeItem[]>([])
  const [themes, setThemes] = useState<ThemeItem[]>([])
  
  const [newCentreInteret, setNewCentreInteret] = useState('')
  const [newCentreDescription, setNewCentreDescription] = useState('')
  const [newCentreAiIndication, setNewCentreAiIndication] = useState('')
  const [newMouvementPrefere, setNewMouvementPrefere] = useState('')
  const [newMouvementDescription, setNewMouvementDescription] = useState('')
  const [newMouvementAiIndication, setNewMouvementAiIndication] = useState('')
  const [newTheme, setNewTheme] = useState('')
  const [newThemeDescription, setNewThemeDescription] = useState('')
  const [newThemeAiIndication, setNewThemeAiIndication] = useState('')
  
  const [selectedCentreImage, setSelectedCentreImage] = useState<string>('')
  const [selectedMouvementImage, setSelectedMouvementImage] = useState<string>('')
  const [selectedThemeImage, setSelectedThemeImage] = useState<string>('')
  
  const [isUploadingCentre, setIsUploadingCentre] = useState(false)
  const [isUploadingMouvement, setIsUploadingMouvement] = useState(false)
  const [isUploadingTheme, setIsUploadingTheme] = useState(false)
  
  // Image principale du musée
  const [mainImage, setMainImage] = useState<string>('')
  const [isUploadingMain, setIsUploadingMain] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !hasPermission('system_settings')) {
      router.push('/login')
      return
    }
    loadThemes()
  }, [isAuthenticated, hasPermission, router])

  const loadThemes = async () => {
    try {
      const response = await fetch('/api/museum-settings')
      if (!response.ok) throw new Error('Erreur lors du chargement')
      
      const settings: MuseumSetting[] = await response.json()
      
      // Charger l'image principale
      const mainImageData = settings.find(s => s.setting_key === 'main_image')
      if (mainImageData?.setting_value) {
        setMainImage(mainImageData.setting_value as string)
      }
      
      // Charger les thématiques
      const centresData = settings.find(s => s.setting_key === 'centres_interets')
      const mouvementsData = settings.find(s => s.setting_key === 'mouvements_preferes')
      const themesData = settings.find(s => s.setting_key === 'themes')
      
      if (centresData?.setting_value) {
        try {
          const parsed = typeof centresData.setting_value === 'string' 
            ? JSON.parse(centresData.setting_value) 
            : centresData.setting_value
          // Vérifier si c'est l'ancien format (tableau de strings) ou le nouveau (tableau d'objets)
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              // Ancien format : convertir vers le nouveau
              setCentresInterets(parsed.map((name: string, index: number) => ({
                name,
                image: DEFAULT_IMAGES.centres[index % DEFAULT_IMAGES.centres.length]
              })))
            } else {
              // Nouveau format
              setCentresInterets(parsed)
            }
          }
        } catch (e) {
          console.error('Erreur parsing centres_interets:', e)
          setCentresInterets([])
        }
      }
      
      if (mouvementsData?.setting_value) {
        try {
          const parsed = typeof mouvementsData.setting_value === 'string' 
            ? JSON.parse(mouvementsData.setting_value) 
            : mouvementsData.setting_value
          // Vérifier si c'est l'ancien format (tableau de strings) ou le nouveau (tableau d'objets)
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              // Ancien format : convertir vers le nouveau
              setMouvementsPreferes(parsed.map((name: string, index: number) => ({
                name,
                image: DEFAULT_IMAGES.mouvements[index % DEFAULT_IMAGES.mouvements.length]
              })))
            } else {
              // Nouveau format
              setMouvementsPreferes(parsed)
            }
          }
        } catch (e) {
          console.error('Erreur parsing mouvements_preferes:', e)
          setMouvementsPreferes([])
        }
      }
      
      if (themesData?.setting_value) {
        try {
          const parsed = typeof themesData.setting_value === 'string' 
            ? JSON.parse(themesData.setting_value) 
            : themesData.setting_value
          if (Array.isArray(parsed)) {
            setThemes(parsed)
          }
        } catch (e) {
          console.error('Erreur parsing themes:', e)
          setThemes([])
        }
      }
      
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveThemes = async () => {
    setIsSaving(true)
    try {
      console.log('Sauvegarde des thématiques:', { centresInterets, mouvementsPreferes })
      
      const responses = await Promise.all([
        fetch('/api/museum-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setting_key: 'centres_interets',
            setting_value: JSON.stringify(centresInterets),
          }),
        }),
        fetch('/api/museum-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setting_key: 'mouvements_preferes',
            setting_value: JSON.stringify(mouvementsPreferes),
          }),
        }),
        fetch('/api/museum-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setting_key: 'themes',
            setting_value: JSON.stringify(themes),
          }),
        }),
      ])

      if (responses.every(r => r.ok)) {
        console.log('Thématiques sauvegardées avec succès')
        alert('Thématiques sauvegardées avec succès!')
      } else {
        console.error('Erreur lors de la sauvegarde des thématiques')
        alert('Erreur lors de la sauvegarde des thématiques')
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Erreur de connexion lors de la sauvegarde')
    }
    setIsSaving(false)
  }

  const addCentreInteret = () => {
    if (newCentreInteret.trim() && !centresInterets.find(c => c.name === newCentreInteret.trim())) {
      const newItem: ThemeItem = {
        name: newCentreInteret.trim(),
        description: newCentreDescription.trim() || undefined,
        aiIndication: newCentreAiIndication.trim() || undefined,
        image: selectedCentreImage || DEFAULT_IMAGES.centres[centresInterets.length % DEFAULT_IMAGES.centres.length]
      }
      setCentresInterets([...centresInterets, newItem])
      setNewCentreInteret('')
      setNewCentreDescription('')
      setNewCentreAiIndication('')
      setSelectedCentreImage('')
    }
  }

  const removeCentreInteret = (index: number) => {
    setCentresInterets(centresInterets.filter((_, i) => i !== index))
  }

  const addMouvementPrefere = () => {
    if (newMouvementPrefere.trim() && !mouvementsPreferes.find(m => m.name === newMouvementPrefere.trim())) {
      const newItem: ThemeItem = {
        name: newMouvementPrefere.trim(),
        description: newMouvementDescription.trim() || undefined,
        aiIndication: newMouvementAiIndication.trim() || undefined,
        image: selectedMouvementImage || DEFAULT_IMAGES.mouvements[mouvementsPreferes.length % DEFAULT_IMAGES.mouvements.length]
      }
      setMouvementsPreferes([...mouvementsPreferes, newItem])
      setNewMouvementPrefere('')
      setNewMouvementDescription('')
      setNewMouvementAiIndication('')
      setSelectedMouvementImage('')
    }
  }

  const removeMouvementPrefere = (index: number) => {
    setMouvementsPreferes(mouvementsPreferes.filter((_, i) => i !== index))
  }

  const addTheme = () => {
    if (newTheme.trim() && !themes.find(t => t.name === newTheme.trim())) {
      const newItem: ThemeItem = {
        name: newTheme.trim(),
        description: newThemeDescription.trim() || undefined,
        aiIndication: newThemeAiIndication.trim() || undefined,
        image: selectedThemeImage || '/api/placeholder/64/64?text=Theme'
      }
      setThemes([...themes, newItem])
      setNewTheme('')
      setNewThemeDescription('')
      setNewThemeAiIndication('')
      setSelectedThemeImage('')
    }
  }

  const removeTheme = (index: number) => {
    setThemes(themes.filter((_, i) => i !== index))
  }

  const handleSaveMainImage = async () => {
    if (!mainImage) return
    
    setIsSaving(true)
    try {
      const response = await fetch('/api/museum-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setting_key: 'main_image',
          setting_value: mainImage,
        }),
      })

      if (response.ok) {
        alert('Image principale sauvegardée avec succès!')
      } else {
        alert('Erreur lors de la sauvegarde de l\'image principale')
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Erreur de connexion lors de la sauvegarde')
    }
    setIsSaving(false)
  }

  const handleImageUpload = async (file: File, type: 'centre' | 'mouvement' | 'main' | 'theme') => {
    const setUploading = type === 'centre' ? setIsUploadingCentre : type === 'mouvement' ? setIsUploadingMouvement : type === 'main' ? setIsUploadingMain : setIsUploadingTheme
    const setSelectedImage = type === 'centre' ? setSelectedCentreImage : type === 'mouvement' ? setSelectedMouvementImage : type === 'main' ? setMainImage : setSelectedThemeImage

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch('/api/upload-theme-image', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      
      if (result.success) {
        setSelectedImage(result.imageUrl)
        alert('Image uploadée avec succès!')
      } else {
        alert(result.error || 'Erreur lors de l\'upload')
      }
    } catch (error) {
      console.error('Erreur upload:', error)
      alert('Erreur lors de l\'upload du fichier')
    } finally {
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des thématiques...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 overflow-y-auto">
      <div className="container mx-auto px-4 max-w-4xl py-8 pb-20">
        
        {/* En-tête */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Retour
            </button>
            <div className="flex items-center gap-3">
              <Palette className="h-8 w-8 text-purple-600" />
              <h1 className="text-2xl font-bold">Thématiques du Musée</h1>
            </div>
            <div className="w-20"></div> {/* Spacer pour centrer le titre */}
          </div>
          <p className="text-gray-600 text-center">
            Configurez les centres d'intérêts et les mouvements artistiques préférés du musée pour personnaliser l'expérience des visiteurs.
          </p>
        </div>

        {/* Image Principale du Musée */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Image className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">Image Principale du Musée</h2>
          </div>
          
          <div className="space-y-4">
            {/* Aperçu de l'image actuelle */}
            {mainImage && (
              <div className="relative w-full h-64 rounded-lg overflow-hidden border-2 border-gray-200">
                <img 
                  src={mainImage} 
                  alt="Image principale du musée"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            {/* Upload */}
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-indigo-300 rounded-lg cursor-pointer hover:border-indigo-400 transition-colors bg-indigo-50">
                <Upload className="h-5 w-5 text-indigo-600" />
                <span className="text-indigo-700 font-medium">
                  {isUploadingMain ? 'Upload en cours...' : mainImage ? 'Changer l\'image' : 'Uploader une image'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploadingMain}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file, 'main')
                  }}
                />
              </label>
              
              {mainImage && (
                <button
                  onClick={handleSaveMainImage}
                  disabled={isSaving}
                  className="px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors flex items-center gap-2 font-medium"
                >
                  <Save className="h-5 w-5" />
                  Sauvegarder
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">Recommandé: , PNG ou JPG (max 5MB)</p>
          </div>
        </div>

        {/* Section Principale */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Centres d'intérêts */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                <h3 className="text-xl font-semibold text-gray-900">Centres d'Intérêts</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du centre d'intérêt *
                  </label>
                  <input
                    type="text"
                    value={newCentreInteret}
                    onChange={(e) => setNewCentreInteret(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCentreInteret()}
                    placeholder="Ex: Art moderne, Sculpture, Peinture..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={newCentreDescription}
                    onChange={(e) => setNewCentreDescription(e.target.value)}
                    placeholder="Description du centre d'intérêt"
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-2 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                    </svg>
                    Indication pour l'IA *
                  </label>
                  <textarea
                    value={newCentreAiIndication}
                    onChange={(e) => setNewCentreAiIndication(e.target.value)}
                    placeholder="Ces informations guideront l'IA dans la génération de contenu..."
                    rows={3}
                    className="w-full p-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-blue-50"
                  />
                  <p className="text-xs text-blue-600 italic mt-1">
                    Ces indications aident l'IA à mieux contextualiser le contenu généré
                  </p>
                </div>
                
                {/* Sélecteur d'image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Image className="inline h-4 w-4 mr-1" />
                    Choisir une image
                  </label>
                  
                  {/* Upload personnalisé */}
                  <div className="mb-3">
                    <label className="flex items-center gap-2 p-3 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                      <Upload className="h-5 w-5 text-blue-500" />
                      <span className="text-blue-600 font-medium">
                        {isUploadingCentre ? 'Upload en cours...' : 'Uploader votre image'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingCentre}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageUpload(file, 'centre')
                        }}
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF (max 5MB)</p>
                  </div>

                  {/* Ou séparateur */}
                  <div className="flex items-center gap-3 my-3">
                    <hr className="flex-1 border-gray-200" />
                    <span className="text-sm text-gray-500 font-medium">OU</span>
                    <hr className="flex-1 border-gray-200" />
                  </div>

                  {/* Images prédéfinies */}
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Images prédéfinies :</p>
                    <div className="grid grid-cols-5 gap-2">
                      {DEFAULT_IMAGES.centres.map((img, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedCentreImage(img)}
                          className={`p-2 border-2 rounded-lg transition-colors ${
                            selectedCentreImage === img
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <img 
                            src={img} 
                            alt={`Option ${index + 1}`} 
                            className="w-full h-12 object-cover rounded"
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Image sélectionnée */}
                  {selectedCentreImage && (
                    <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Image sélectionnée :</p>
                      <div className="flex items-center gap-2">
                        <img 
                          src={selectedCentreImage} 
                          alt="Sélectionnée" 
                          className="w-12 h-12 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedCentreImage('')}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Supprimer la sélection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={addCentreInteret}
                  disabled={!newCentreInteret.trim()}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter le centre d'intérêt
                </button>
              </div>

              <div className="space-y-3">
                {centresInterets.map((centre, index) => (
                  <div key={index} className="flex flex-col gap-2 bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      <img 
                        src={centre.image || DEFAULT_IMAGES.centres[index % DEFAULT_IMAGES.centres.length]} 
                        alt={centre.name}
                        className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                      />
                      <span className="text-gray-800 font-medium flex-grow">{centre.name}</span>
                      <button
                        onClick={() => removeCentreInteret(index)}
                        className="text-red-500 hover:text-red-700 transition-colors p-1"
                        title="Supprimer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {centre.description && (
                      <p className="text-gray-600 text-sm pl-15">{centre.description}</p>
                    )}
                    {centre.aiIndication && (
                      <div className="pl-15 bg-blue-100 p-2 rounded border border-blue-200">
                        <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                          </svg>
                          Indication IA:
                        </p>
                        <p className="text-blue-800 text-sm italic">{centre.aiIndication}</p>
                      </div>
                    )}
                  </div>
                ))}
                {centresInterets.length === 0 && (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <Palette className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="italic">Aucun centre d'intérêt configuré</p>
                    <p className="text-sm">Ajoutez des thèmes pour personnaliser l'expérience</p>
                  </div>
                )}
              </div>
            </div>

            {/* Mouvements préférés */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
                <h3 className="text-xl font-semibold text-gray-900">Mouvements Préférés</h3>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du mouvement artistique *
                  </label>
                  <input
                    type="text"
                    value={newMouvementPrefere}
                    onChange={(e) => setNewMouvementPrefere(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addMouvementPrefere()}
                    placeholder="Ex: Impressionnisme, Cubisme, Renaissance..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={newMouvementDescription}
                    onChange={(e) => setNewMouvementDescription(e.target.value)}
                    placeholder="Description du mouvement artistique"
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-2 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                    </svg>
                    Indication pour l'IA *
                  </label>
                  <textarea
                    value={newMouvementAiIndication}
                    onChange={(e) => setNewMouvementAiIndication(e.target.value)}
                    placeholder="Ces informations guideront l'IA dans la génération de contenu..."
                    rows={3}
                    className="w-full p-3 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-purple-50"
                  />
                  <p className="text-xs text-purple-600 italic mt-1">
                    Ces indications aident l'IA à mieux contextualiser le contenu généré
                  </p>
                </div>
                
                {/* Sélecteur d'image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Image className="inline h-4 w-4 mr-1" />
                    Choisir une image
                  </label>
                  
                  {/* Upload personnalisé */}
                  <div className="mb-3">
                    <label className="flex items-center gap-2 p-3 border-2 border-dashed border-purple-300 rounded-lg cursor-pointer hover:border-purple-400 transition-colors">
                      <Upload className="h-5 w-5 text-purple-500" />
                      <span className="text-purple-600 font-medium">
                        {isUploadingMouvement ? 'Upload en cours...' : 'Uploader votre image'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingMouvement}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageUpload(file, 'mouvement')
                        }}
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF (max 5MB)</p>
                  </div>

                  {/* Ou séparateur */}
                  <div className="flex items-center gap-3 my-3">
                    <hr className="flex-1 border-gray-200" />
                    <span className="text-sm text-gray-500 font-medium">OU</span>
                    <hr className="flex-1 border-gray-200" />
                  </div>

                  {/* Images prédéfinies */}
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Images prédéfinies :</p>
                    <div className="grid grid-cols-5 gap-2">
                      {DEFAULT_IMAGES.mouvements.map((img, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedMouvementImage(img)}
                          className={`p-2 border-2 rounded-lg transition-colors ${
                            selectedMouvementImage === img
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          <img 
                            src={img} 
                            alt={`Option ${index + 1}`} 
                            className="w-full h-12 object-cover rounded"
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Image sélectionnée */}
                  {selectedMouvementImage && (
                    <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Image sélectionnée :</p>
                      <div className="flex items-center gap-2">
                        <img 
                          src={selectedMouvementImage} 
                          alt="Sélectionnée" 
                          className="w-12 h-12 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedMouvementImage('')}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Supprimer la sélection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={addMouvementPrefere}
                  disabled={!newMouvementPrefere.trim()}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter le mouvement artistique
                </button>
              </div>

              <div className="space-y-3">
                {mouvementsPreferes.map((mouvement, index) => (
                  <div key={index} className="flex flex-col gap-2 bg-purple-50 p-3 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-3">
                      <img 
                        src={mouvement.image || DEFAULT_IMAGES.mouvements[index % DEFAULT_IMAGES.mouvements.length]} 
                        alt={mouvement.name}
                        className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                      />
                      <span className="text-gray-800 font-medium flex-grow">{mouvement.name}</span>
                      <button
                        onClick={() => removeMouvementPrefere(index)}
                        className="text-red-500 hover:text-red-700 transition-colors p-1"
                        title="Supprimer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {mouvement.description && (
                      <p className="text-gray-600 text-sm pl-15">{mouvement.description}</p>
                    )}
                    {mouvement.aiIndication && (
                      <div className="pl-15 bg-purple-100 p-2 rounded border border-purple-200">
                        <p className="text-xs text-purple-700 font-medium mb-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                          </svg>
                          Indication IA:
                        </p>
                        <p className="text-purple-800 text-sm italic">{mouvement.aiIndication}</p>
                      </div>
                    )}
                  </div>
                ))}
                {mouvementsPreferes.length === 0 && (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <Palette className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="italic">Aucun mouvement artistique configuré</p>
                    <p className="text-sm">Ajoutez des styles pour enrichir le contenu</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bouton de sauvegarde */}
          <div className="mt-8 text-center border-t pt-6">
            <button
              onClick={handleSaveThemes}
              disabled={isSaving}
              className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center gap-2 mx-auto text-lg font-medium"
            >
              <Save className="h-5 w-5" />
              {isSaving ? 'Sauvegarde en cours...' : 'Sauvegarder les Thématiques'}
            </button>
          </div>
        </div>

        {/* Section Thèmes */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <div className="flex items-center gap-2 mb-6">
            <Palette className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-semibold text-gray-900">Thèmes</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du thème *
              </label>
              <input
                type="text"
                value={newTheme}
                onChange={(e) => setNewTheme(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTheme()}
                placeholder="Ex: Histoire, Architecture, Nature..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={newThemeDescription}
                onChange={(e) => setNewThemeDescription(e.target.value)}
                placeholder="Description du thème"
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                Indication pour l'IA *
              </label>
              <textarea
                value={newThemeAiIndication}
                onChange={(e) => setNewThemeAiIndication(e.target.value)}
                placeholder="Ces informations guideront l'IA dans la génération de contenu..."
                rows={3}
                className="w-full p-3 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none bg-green-50"
              />
              <p className="text-xs text-green-600 italic mt-1">
                Ces indications aident l'IA à mieux contextualiser le contenu généré
              </p>
            </div>
            
            {/* Sélecteur d'image pour thème */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Image className="inline h-4 w-4 mr-1" />
                Choisir une image
              </label>
              
              {/* Upload personnalisé */}
              <div className="mb-3">
                <label className="flex items-center gap-2 p-3 border-2 border-dashed border-green-300 rounded-lg cursor-pointer hover:border-green-400 transition-colors">
                  <Upload className="h-5 w-5 text-green-500" />
                  <span className="text-green-600 font-medium">
                    {isUploadingTheme ? 'Upload en cours...' : 'Uploader votre image'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingTheme}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImageUpload(file, 'theme')
                    }}
                  />
                </label>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF (max 5MB)</p>
              </div>

              {/* Image sélectionnée */}
              {selectedThemeImage && (
                <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Image sélectionnée :</p>
                  <div className="flex items-center gap-2">
                    <img 
                      src={selectedThemeImage} 
                      alt="Sélectionnée" 
                      className="w-12 h-12 object-cover rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedThemeImage('')}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Supprimer la sélection
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={addTheme}
              disabled={!newTheme.trim()}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Ajouter le thème
            </button>
          </div>

          {/* Liste des thèmes */}
          <div className="mt-6 space-y-3">
            {themes.map((theme, index) => (
              <div key={index} className="flex flex-col bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center gap-3">
                  <img 
                    src={theme.image || '/api/placeholder/64/64?text=Theme'} 
                    alt={theme.name}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                  <div className="flex-grow">
                    <h4 className="text-gray-900 font-semibold text-lg">{theme.name}</h4>
                    {theme.description && (
                      <p className="text-gray-600 text-sm mt-1">{theme.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeTheme(index)}
                    className="text-red-500 hover:text-red-700 transition-colors p-2"
                    title="Supprimer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {theme.aiIndication && (
                  <div className="mt-3 bg-green-100 p-2 rounded border border-green-200">
                    <p className="text-xs text-green-700 font-medium mb-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                      </svg>
                      Indication IA:
                    </p>
                    <p className="text-green-800 text-sm italic">{theme.aiIndication}</p>
                  </div>
                )}
              </div>
            ))}
            {themes.length === 0 && (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <Palette className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="italic">Aucun thème configuré</p>
                <p className="text-sm">Ajoutez des thèmes pour enrichir le contenu</p>
              </div>
            )}
          </div>
        </div>

        {/* Section Résumé */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 mt-6 border border-blue-200">
          <h2 className="text-xl font-semibold text-center mb-6 text-gray-800">Résumé des Thématiques</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-blue-700 mb-2 flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                Centres d'intérêts ({centresInterets.length})
              </h3>
              <div className="text-sm text-gray-700">
                {centresInterets.length > 0 ? (
                  <div className="space-y-2">
                    {centresInterets.map((centre, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs bg-blue-100 px-2 py-1 rounded">
                        <img 
                          src={centre.image || DEFAULT_IMAGES.centres[index % DEFAULT_IMAGES.centres.length]} 
                          alt={centre.name}
                          className="w-6 h-6 object-cover rounded"
                        />
                        <span>{centre.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="italic text-gray-500">Aucun configuré</span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-purple-700 mb-2 flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                Mouvements préférés ({mouvementsPreferes.length})
              </h3>
              <div className="text-sm text-gray-700">
                {mouvementsPreferes.length > 0 ? (
                  <div className="space-y-2">
                    {mouvementsPreferes.map((mouvement, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs bg-purple-100 px-2 py-1 rounded">
                        <img 
                          src={mouvement.image || DEFAULT_IMAGES.mouvements[index % DEFAULT_IMAGES.mouvements.length]} 
                          alt={mouvement.name}
                          className="w-6 h-6 object-cover rounded"
                        />
                        <span>{mouvement.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="italic text-gray-500">Aucun configuré</span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-green-700 mb-2 flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                Thèmes ({themes.length})
              </h3>
              <div className="text-sm text-gray-700">
                {themes.length > 0 ? (
                  <div className="space-y-2">
                    {themes.map((theme, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs bg-green-100 px-2 py-1 rounded">
                        <img 
                          src={theme.image || '/api/placeholder/64/64?text=Theme'} 
                          alt={theme.name}
                          className="w-6 h-6 object-cover rounded"
                        />
                        <span>{theme.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="italic text-gray-500">Aucun configuré</span>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}