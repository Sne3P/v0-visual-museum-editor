"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Users, Plus, ShoppingCart } from 'lucide-react'

export default function AccueilUsersManagementPage() {
  const { isAuthenticated, hasPermission, currentUser } = useAuth()
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: ''
  })
  const [createdUsers, setCreatedUsers] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated || !hasPermission('manage_accueil')) {
      router.push('/admin')
    }
  }, [isAuthenticated, hasPermission, router])

  const generatePassword = () => {
    const adjectives = ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Rose']
    const nouns = ['Chat', 'Chien', 'Lion', 'Ours', 'Loup']
    const numbers = Math.floor(Math.random() * 99) + 1
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    return `${adj}${noun}${numbers}`
  }

  const generateUsername = (name: string) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '').slice(0, 6)
    const randomNum = Math.floor(Math.random() * 999) + 1
    return `acc${cleanName}${randomNum}`
  }

  const handleCreateUser = () => {
    if (!formData.name) return
    
    const newUser = {
      id: Date.now().toString(),
      name: formData.name,
      museeId: 'musee-principal', // Musée unique
      username: formData.username || generateUsername(formData.name),
      password: formData.password || generatePassword(),
      role: 'accueil',
      createdAt: new Date().toLocaleString('fr-FR'),
      createdBy: currentUser?.name
    }

    setCreatedUsers([...createdUsers, newUser])
    setFormData({ name: '', username: '', password: '' })
    setIsCreating(false)
  }

  const startCreation = () => {
    setIsCreating(true)
    setFormData({
      name: '',
      username: '',
      password: generatePassword()
    })
  }

  if (!isAuthenticated || !hasPermission('manage_accueil')) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="outline" 
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Agents d'Accueil</h1>
            <p className="text-gray-600 mt-1">Créer et gérer les comptes agents d'accueil/vente du musée</p>
          </div>
        </div>

        {!isCreating ? (
          <>
            {/* Bouton de création */}
            <Card className="mb-8">
              <CardHeader className="text-center">
                <div className="flex justify-center mb-3">
                  <div className="p-4 bg-green-100 rounded-full">
                    <ShoppingCart className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <CardTitle className="text-2xl">Créer un Agent d'Accueil/Vente</CardTitle>
                <CardDescription>
                  Les agents d'accueil ont un accès en consultation pour aider les visiteurs et gérer les ventes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={startCreation} className="w-full" size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  Créer un nouvel agent
                </Button>
              </CardContent>
            </Card>

            {/* Liste des agents créés */}
            {createdUsers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Agents d'Accueil Créés ({createdUsers.length})
                  </CardTitle>
                  <CardDescription>
                    Comptes créés pour le musée principal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {createdUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                        <div className="flex-1">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-600">
                            Agent d'Accueil/Vente - {user.museeId}
                          </div>
                          <div className="text-xs text-gray-500">
                            Créé le {user.createdAt} par {user.createdBy}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono bg-white px-3 py-2 rounded border">
                            <div><strong>Login:</strong> {user.username}</div>
                            <div><strong>MDP:</strong> {user.password}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          /* Formulaire de création */
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-green-600" />
                Créer un Agent d'Accueil/Vente
              </CardTitle>
              <CardDescription>
                Remplissez les informations pour créer le nouveau compte agent d'accueil
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nom complet *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setFormData({
                      ...formData, 
                      name,
                      username: name ? generateUsername(name) : ''
                    })
                  }}
                  placeholder="Marie Martin"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Identifiant (généré automatiquement)</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    placeholder="Généré automatiquement"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe temporaire</Label>
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setFormData({...formData, password: generatePassword()})}
                    >
                      Nouveau
                    </Button>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Musée :</strong> Musée Principal<br />
                  <strong>Permissions :</strong> Consultation uniquement, aide aux visiteurs et ventes
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={handleCreateUser}
                  disabled={!formData.name}
                  className="flex-1"
                >
                  Créer l'agent d'accueil
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsCreating(false)
                    setFormData({ name: '', username: '', password: '' })
                  }}
                >
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}