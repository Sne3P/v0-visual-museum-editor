'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ArrowLeft, 
  RefreshCw, 
  Eye, 
  Zap, 
  FileText, 
  Database, 
  Trash2, 
  Sparkles,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react'

// ==========================================
// TYPES
// ==========================================

interface Oeuvre {
  oeuvre_id: number
  title: string
  artist: string
  date_oeuvre: string
  room: number | null
  pdf_link: string | null
  pregeneration_count?: number
}

interface CriteriaType {
  type: string
  label: string
  ordre: number
  is_required: boolean
}

interface Criteria {
  criteria_id: number
  type: string
  name: string
  label: string
  description: string | null
  ordre: number
}

interface Pregeneration {
  pregeneration_id: number
  oeuvre_id: number
  criteria_combination: Record<string, number> // {"age": 1, "thematique": 4, ...}
  pregeneration_text: string
  created_at: string
  voice_link: string | null
  // Enrichi côté client
  criteria_labels?: Record<string, string>
}

interface Stats {
  total_oeuvres: number
  total_pregenerations: number
  expected_pregenerations: number
 expected_per_oeuvre: number
  completion_rate: number
}

// ==========================================
// COMPOSANT PRINCIPAL
// ==========================================

export default function NarrationsDashboard() {
  const router = useRouter()
  
  // State
  const [oeuvres, setOeuvres] = useState<Oeuvre[]>([])
  const [criteriaTypes, setCriteriaTypes] = useState<CriteriaType[]>([])
  const [allCriterias, setAllCriterias] = useState<Criteria[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [selectedOeuvre, setSelectedOeuvre] = useState<Oeuvre | null>(null)
  const [pregenerations, setPregenerations] = useState<Pregeneration[]>([])
  const [modalPregen, setModalPregen] = useState<Pregeneration | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'oeuvres' | 'narrations' | 'actions'>('oeuvres')
  
  // États pour génération précise
  const [showGeneratePreciseModal, setShowGeneratePreciseModal] = useState(false)
  const [selectedCombination, setSelectedCombination] = useState<Record<string, number> | null>(null)
  
  // États pour génération par profil
  const [showGenerateByProfileModal, setShowGenerateByProfileModal] = useState(false)
  const [profileForGeneration, setProfileForGeneration] = useState<Record<string, number> | null>(null)

  // Calcul du nombre attendu de narrations par œuvre (produit cartésien des critères)
   // Utiliser la valeur calculée par le backend
   const expectedNarrationsPerOeuvre = stats?.expected_per_oeuvre || 36

  // =========================================
  // CHARGEMENT DONNÉES
  // ==========================================

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoading(true)
    try {
      await Promise.all([
        loadCriteriaTypes(),
        loadAllCriterias(),
        loadOeuvres(),
        loadStats()
      ])
    } catch (error) {
      console.error('Erreur chargement initial:', error)
    }
    setLoading(false)
  }

  async function loadCriteriaTypes() {
    try {
      const res = await fetch('/api/criteria-types')
      if (res.ok) {
        const data = await res.json()
        setCriteriaTypes(data.types || [])
      }
    } catch (error) {
      console.error('Erreur chargement criteria types:', error)
    }
  }

  async function loadAllCriterias() {
    try {
      // Charger tous les critères (pas de type filter)
      const types = ['age', 'thematique', 'style_texte'] // Hardcode pour l'instant
      const allPromises = types.map(type => 
        fetch(`/api/criterias?type=${type}`).then(r => r.json())
      )
      const results = await Promise.all(allPromises)
      const merged = results.flatMap(data => data.criterias || [])
      setAllCriterias(merged)
    } catch (error) {
      console.error('Erreur chargement criterias:', error)
    }
  }

  async function loadOeuvres() {
    try {
      const res = await fetch('/api/admin/get-oeuvres')
      if (res.ok) {
        const data = await res.json()
        setOeuvres(data.oeuvres || [])
      }
    } catch (error) {
      console.error('Erreur chargement œuvres:', error)
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/admin/get-stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Erreur chargement stats:', error)
    }
  }

  async function loadPregenerationsForOeuvre(oeuvreId: number) {
    try {
      const res = await fetch(`/api/admin/get-pregenerations/${oeuvreId}`)
      if (res.ok) {
        const data = await res.json()
        const enrichedPregens = enrichPregenerationsWithLabels(data.pregenerations || [])
        setPregenerations(enrichedPregens)
      }
    } catch (error) {
      console.error('Erreur chargement prégénérations:', error)
    }
  }

  // Enrichir les prégénérations avec les labels lisibles
  function enrichPregenerationsWithLabels(pregens: Pregeneration[]): Pregeneration[] {
    return pregens.map(pregen => {
      const labels: Record<string, string> = {}
      
      // Pour chaque criteria_id dans la combinaison
      Object.entries(pregen.criteria_combination).forEach(([type, criteriaId]) => {
        const criteria = allCriterias.find(c => c.criteria_id === criteriaId)
        if (criteria) {
          labels[type] = criteria.label
        }
      })
      
      return {
        ...pregen,
        criteria_labels: labels
      }
    })
  }

  // ==========================================
  // ACTIONS DATABASE
  // ==========================================

  async function seedDatabase() {
    if (!confirm('Lancer le seed de la base de données ?\n\nCela va générer toutes les combinaisons manquantes de narrations pour toutes les œuvres.')) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/seed-narrations', {
        method: 'POST'
      })

      const data = await res.json()
      if (data.success) {
        alert(`✅ Seed terminé !\n\n${data.inserted} nouvelles narrations insérées\n${data.skipped} combinaisons déjà existantes`)
        await loadStats()
        await loadOeuvres()
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur seed:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  async function deleteAllNarrations() {
    if (!confirm('⚠️ ATTENTION !\n\nSupprimer TOUTES les narrations de la base de données ?\n\nCette action est irréversible !')) {
      return
    }

    if (!confirm('Êtes-vous VRAIMENT sûr ? Toutes les narrations seront perdues !')) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/delete-all-narrations', {
        method: 'DELETE'
      })

      const data = await res.json()
      if (data.success) {
        alert(`✅ ${data.deleted} narrations supprimées`)
        await loadStats()
        await loadOeuvres()
        setPregenerations([])
        setSelectedOeuvre(null)
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur suppression:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  async function generateNarrationsForOeuvre(oeuvreId: number) {
    if (!confirm('Générer les narrations manquantes pour cette œuvre ?\n\nCela utilisera le script de seed intelligent.')) {
      return
    }

    setLoading(true)
    try {
      // const res = await fetch('/api/admin/seed-narrations', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ oeuvre_id: oeuvreId })
      // })
      const res = await fetch(`/api/admin/pregenerate-artwork/${oeuvreId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oeuvre_id: oeuvreId })
      })

      const data = await res.json()
      if (data.success) {
        alert(`✅ Narrations générées !\n\n${data.inserted} nouvelles narrations`)
        await loadStats()
        await loadOeuvres()
        if (selectedOeuvre) {
          await loadPregenerationsForOeuvre(oeuvreId)
        }
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur génération:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  async function generateAllMissingNarrations() {
    const expectedTotal = oeuvres.length * (stats?.expected_pregenerations || 36)
    const missing = expectedTotal - (stats?.total_pregenerations || 0)

    if (!confirm(`Générer toutes les narrations manquantes ?\n\n${missing} narrations seront créées pour ${oeuvres.length} œuvres.`)) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/seed-narrations', {
        method: 'POST'
      })

      const data = await res.json()
      if (data.success) {
        alert(`✅ Génération terminée !\n\n${data.inserted} nouvelles narrations\n${data.skipped} déjà existantes`)
        await loadStats()
        await loadOeuvres()
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur génération globale:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  async function regenerateAllNarrations() {
    if (!confirm('⚠️ ATTENTION !\n\nRégénérer TOUTES les narrations ?\n\nCela va supprimer et recréer toutes les narrations existantes.')) {
      return
    }

    setLoading(true)
    try {
      // 1. Supprimer
      await fetch('/api/admin/delete-all-narrations', { method: 'DELETE' })
      
      // 2. Re-seed
      const res = await fetch('/api/admin/seed-narrations', { method: 'POST' })
      const data = await res.json()
      
      if (data.success) {
        alert(`✅ Régénération terminée !\n\n${data.inserted} narrations créées`)
        await loadStats()
        await loadOeuvres()
        setPregenerations([])
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur régénération:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  // ==========================================
  // NOUVELLES ACTIONS: GÉNÉRATION PRÉCISE & PAR PROFIL
  // ==========================================

  async function generatePreciseNarration(oeuvreId: number, combination: Record<string, number>) {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/generate-narration-precise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oeuvre_id: oeuvreId,
          criteria_combination: combination
        })
      })

      const data = await res.json()
      if (data.success) {
        alert(`✅ Narration générée avec succès !`)
        // Recharger les narrations
        if (selectedOeuvre) {
          await loadPregenerationsForOeuvre(oeuvreId)
        }
        await loadStats()
        setShowGeneratePreciseModal(false)
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur génération précise:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  async function regenerateSingleNarration(pregen: Pregeneration) {
    if (!selectedOeuvre) return

    if (!confirm(`Régénérer cette narration ?\n\nProfil: ${Object.values(pregen.criteria_labels || {}).join(', ')}\n\nLa narration actuelle sera remplacée.`)) {
      return
    }

    await generatePreciseNarration(selectedOeuvre.oeuvre_id, pregen.criteria_combination)
  }

  async function generateNarrationsByProfile(combination: Record<string, number>) {
    const labels = Object.entries(combination).map(([type, id]) => {
      const criteria = allCriterias.find(c => c.criteria_id === id)
      return criteria ? criteria.label : `${type}:${id}`
    })

    if (!confirm(`Générer les narrations pour ce profil dans TOUTES les œuvres ?\n\nProfil: ${labels.join(', ')}\n\nCela peut prendre plusieurs minutes.`)) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/generate-narrations-by-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criteria_combination: combination
        })
      })

      const data = await res.json()
      if (data.success) {
        alert(`✅ Génération terminée !\n\n${data.inserted} narrations générées\n${data.skipped} déjà existantes`)
        await loadStats()
        await loadOeuvres()
        setShowGenerateByProfileModal(false)
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error) {
      console.error('Erreur génération par profil:', error)
      alert(`❌ Erreur: ${error}`)
    }
    setLoading(false)
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  function viewOeuvreDetails(oeuvre: Oeuvre) {
    setSelectedOeuvre(oeuvre)
    loadPregenerationsForOeuvre(oeuvre.oeuvre_id)
    setActiveTab('narrations')
  }

  // ==========================================
  // HELPERS
  // ==========================================

  function getCompletionColor(count: number, expected: number): string {
    if (count === 0) return 'bg-gray-100 text-gray-600'
    if (count === expected) return 'bg-green-100 text-green-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/admin')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Accueil Admin
            </Button>
            <h1 className="text-3xl font-bold">Dashboard Narrations</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadInitialData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Œuvres totales</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_oeuvres}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  dans la base de données
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Narrations générées</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_pregenerations}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  sur {stats.expected_pregenerations} attendues
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taux de complétion</CardTitle>
                {stats.completion_rate === 100 ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completion_rate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.expected_pregenerations - stats.total_pregenerations} manquantes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Combinaisons</CardTitle>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{criteriaTypes.length} types</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {allCriterias.length} critères au total
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === 'oeuvres' ? 'default' : 'outline'}
            onClick={() => setActiveTab('oeuvres')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Œuvres
          </Button>
          <Button
            variant={activeTab === 'narrations' ? 'default' : 'outline'}
            onClick={() => setActiveTab('narrations')}
            disabled={!selectedOeuvre}
          >
            <Database className="h-4 w-4 mr-2" />
            Narrations {selectedOeuvre && `(${selectedOeuvre.title})`}
          </Button>
          <Button
            variant={activeTab === 'actions' ? 'default' : 'outline'}
            onClick={() => setActiveTab('actions')}
          >
            <Zap className="h-4 w-4 mr-2" />
            Actions
          </Button>
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-6">
            {/* TAB: OEUVRES */}
            {activeTab === 'oeuvres' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Liste des œuvres</h2>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500">Chargement...</p>
                  </div>
                ) : oeuvres.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>Aucune œuvre trouvée</p>
                    <p className="text-sm">Créez des œuvres dans l'éditeur</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-sm">ID</th>
                          <th className="text-left p-3 font-medium text-sm">Titre</th>
                          <th className="text-left p-3 font-medium text-sm">Artiste</th>
                          <th className="text-left p-3 font-medium text-sm">Date</th>
                          <th className="text-left p-3 font-medium text-sm">Salle</th>
                          <th className="text-left p-3 font-medium text-sm">Narrations</th>
                          <th className="text-left p-3 font-medium text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oeuvres.map((oeuvre) => (
                          <tr key={oeuvre.oeuvre_id} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm">{oeuvre.oeuvre_id}</td>
                            <td className="p-3 font-medium">{oeuvre.title}</td>
                            <td className="p-3 text-sm text-gray-600">{oeuvre.artist}</td>
                            <td className="p-3 text-sm text-gray-600">{oeuvre.date_oeuvre}</td>
                            <td className="p-3 text-sm">{oeuvre.room || '-'}</td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getCompletionColor(oeuvre.pregeneration_count || 0, expectedNarrationsPerOeuvre)}`}>
                                {oeuvre.pregeneration_count || 0}/{expectedNarrationsPerOeuvre}
                              </span>
                            </td>
                            <td className="p-3 space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => viewOeuvreDetails(oeuvre)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Voir
                              </Button>
                              {oeuvre.pdf_link && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(oeuvre.pdf_link!, '_blank')}
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  PDF
                                </Button>
                              )}
                              <Button
                                size="sm"
                                onClick={() => generateNarrationsForOeuvre(oeuvre.oeuvre_id)}
                                disabled={loading}
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                Générer
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: NARRATIONS */}
            {activeTab === 'narrations' && selectedOeuvre && (
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-semibold mb-1">
                    {selectedOeuvre.title}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {selectedOeuvre.artist} • {selectedOeuvre.date_oeuvre}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    {pregenerations.length}/{expectedNarrationsPerOeuvre} narrations générées
                  </p>
                </div>

                {pregenerations.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-gray-500 mb-4">Aucune narration pour cette œuvre</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => generateNarrationsForOeuvre(selectedOeuvre.oeuvre_id)}
                        disabled={loading}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Générer toutes les narrations
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowGeneratePreciseModal(true)
                        }}
                        disabled={loading}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Générer 1 narration précise
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-600">
                        Cliquez sur une narration pour la voir ou la régénérer
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowGeneratePreciseModal(true)}
                        disabled={loading}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Générer 1 narration
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                      {pregenerations.map((pregen) => (
                        <Card 
                          key={pregen.pregeneration_id}
                          className="cursor-pointer hover:shadow-md transition-shadow group relative"
                        >
                          <div onClick={() => setModalPregen(pregen)}>
                            <CardHeader className="pb-2">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(pregen.criteria_labels || {}).map(([type, label]) => (
                                  <span
                                    key={type}
                                    className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium"
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-gray-700 line-clamp-3">
                                {pregen.pregeneration_text.substring(0, 150)}...
                              </p>
                              <p className="text-xs text-gray-400 mt-2">
                                Cliquer pour voir en entier
                              </p>
                            </CardContent>
                          </div>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-white"
                              onClick={(e) => {
                                e.stopPropagation()
                                regenerateSingleNarration(pregen)
                              }}
                              disabled={loading}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: ACTIONS */}
            {activeTab === 'actions' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Actions globales</h2>

                {/* Seed Database */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Seed de la base de données
                    </CardTitle>
                    <CardDescription>
                      Génère automatiquement toutes les combinaisons de narrations manquantes pour toutes les œuvres.
                      Utilise les critères dynamiques de la base de données.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={seedDatabase} disabled={loading}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Lancer le seed
                    </Button>
                  </CardContent>
                </Card>

                {/* Génération ciblée */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Génération de narrations
                    </CardTitle>
                    <CardDescription>
                      Générez les narrations manquantes ou régénérez toutes les narrations.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Button 
                        onClick={generateAllMissingNarrations} 
                        disabled={loading}
                        className="w-full sm:w-auto"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Générer les narrations manquantes
                      </Button>
                      <p className="text-xs text-gray-500 mt-1">
                        Génère seulement les combinaisons qui n'existent pas encore
                      </p>
                    </div>

                    <div>
                      <Button 
                        onClick={regenerateAllNarrations} 
                        disabled={loading}
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Tout régénérer (avec suppression)
                      </Button>
                      <p className="text-xs text-gray-500 mt-1">
                        Supprime et recrée toutes les narrations
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Génération par profil */}
                <Card className="border-purple-200 bg-purple-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-700">
                      <Sparkles className="h-5 w-5" />
                      Génération par profil
                    </CardTitle>
                    <CardDescription>
                      Générez toutes les narrations pour un profil spécifique dans toutes les œuvres.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={() => setShowGenerateByProfileModal(true)} 
                      disabled={loading}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Générer par profil
                    </Button>
                    <p className="text-xs text-gray-600 mt-2">
                      Choisissez un profil et générez cette combinaison pour toutes les œuvres
                    </p>
                  </CardContent>
                </Card>

                {/* Suppression */}
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-700">
                      <Trash2 className="h-5 w-5" />
                      Zone dangereuse
                    </CardTitle>
                    <CardDescription>
                      Actions irréversibles. Utilisez avec précaution.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={deleteAllNarrations} 
                      disabled={loading}
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer toutes les narrations
                    </Button>
                  </CardContent>
                </Card>

                {/* Info critères */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Informations sur les critères
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">Types de critères actifs :</p>
                      <ul className="space-y-1">
                        {criteriaTypes.map(type => {
                          const count = allCriterias.filter(c => c.type === type.type).length
                          return (
                            <li key={type.type} className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                                {type.label}
                              </span>
                              <span className="text-gray-600">
                                {count} options
                              </span>
                              {type.is_required && (
                                <span className="text-xs text-red-600">(requis)</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      <p className="text-gray-600 mt-4">
                        Combinaisons totales par œuvre : <strong>{expectedNarrationsPerOeuvre}</strong>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Prévisualisation */}
      {modalPregen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold mb-3">Prévisualisation Narration</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(modalPregen.criteria_labels || {}).map(([type, label]) => (
                    <span
                      key={type}
                      className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setModalPregen(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content scrollable */}
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                {modalPregen.pregeneration_text}
              </p>
              
              <div className="mt-6 pt-4 border-t space-y-1 text-sm text-gray-500">
                <p>Longueur : {modalPregen.pregeneration_text.length} caractères</p>
                <p>Mots : ~{Math.round(modalPregen.pregeneration_text.split(/\s+/).length)}</p>
                <p>Créé le : {new Date(modalPregen.created_at).toLocaleString('fr-FR')}</p>
                {modalPregen.voice_link && (
                  <p className="text-green-600">Audio généré disponible</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <Button 
                variant="outline"
                onClick={() => {
                  if (selectedOeuvre && confirm('Régénérer cette narration ?')) {
                    regenerateSingleNarration(modalPregen)
                    setModalPregen(null)
                  }
                }}
                disabled={loading || !selectedOeuvre}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Régénérer
              </Button>
              <Button onClick={() => setModalPregen(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Génération Précise */}
      {showGeneratePreciseModal && selectedOeuvre && (
        <ProfileSelectorModal
          title="Générer une narration précise"
          description={`Sélectionnez un profil pour générer une narration pour "${selectedOeuvre.title}"`}
          criteriaTypes={criteriaTypes}
          allCriterias={allCriterias}
          onConfirm={(combination) => {
            generatePreciseNarration(selectedOeuvre.oeuvre_id, combination)
          }}
          onCancel={() => setShowGeneratePreciseModal(false)}
          loading={loading}
        />
      )}

      {/* Modal Génération par Profil */}
      {showGenerateByProfileModal && (
        <ProfileSelectorModal
          title="Générer par profil"
          description="Sélectionnez un profil pour générer cette combinaison dans TOUTES les œuvres"
          criteriaTypes={criteriaTypes}
          allCriterias={allCriterias}
          onConfirm={(combination) => {
            generateNarrationsByProfile(combination)
          }}
          onCancel={() => setShowGenerateByProfileModal(false)}
          loading={loading}
        />
      )}
    </div>
  )
}

// ==========================================
// COMPOSANT: ProfileSelectorModal
// ==========================================

interface ProfileSelectorModalProps {
  title: string
  description: string
  criteriaTypes: CriteriaType[]
  allCriterias: Criteria[]
  onConfirm: (combination: Record<string, number>) => void
  onCancel: () => void
  loading: boolean
}

function ProfileSelectorModal({
  title,
  description,
  criteriaTypes,
  allCriterias,
  onConfirm,
  onCancel,
  loading
}: ProfileSelectorModalProps) {
  const [selectedCombination, setSelectedCombination] = useState<Record<string, number>>({})

  // Grouper les critères par type
  const criteriaByType = criteriaTypes.reduce((acc, type) => {
    acc[type.type] = allCriterias.filter(c => c.type === type.type)
    return acc
  }, {} as Record<string, Criteria[]>)

  const isComplete = criteriaTypes
    .filter(t => t.is_required)
    .every(t => selectedCombination[t.type])

  const handleConfirm = () => {
    if (isComplete) {
      onConfirm(selectedCombination)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold mb-2">{title}</h3>
              <p className="text-sm text-gray-600">{description}</p>
            </div>
            <button
              onClick={onCancel}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-6">
            {criteriaTypes.map(type => {
              const options = criteriaByType[type.type] || []
              const selected = selectedCombination[type.type]

              return (
                <div key={type.type}>
                  <label className="block text-sm font-medium mb-2">
                    {type.label}
                    {type.is_required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {options.map(criteria => (
                      <button
                        key={criteria.criteria_id}
                        onClick={() => {
                          setSelectedCombination(prev => ({
                            ...prev,
                            [type.type]: criteria.criteria_id
                          }))
                        }}
                        className={`p-3 border rounded-lg text-left transition-all ${
                          selected === criteria.criteria_id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium">{criteria.label}</div>
                        {criteria.description && (
                          <div className="text-xs text-gray-500 mt-1">
                            {criteria.description}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {isComplete ? (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Profil complet
              </span>
            ) : (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Sélectionnez tous les critères requis
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Annuler
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={!isComplete || loading}
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Générer
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
