"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Users, Plus, UserCheck, ShoppingCart } from 'lucide-react'

export default function UsersManagementPage() {
  const { isAuthenticated, hasPermission, currentUser } = useAuth()
  const router = useRouter()
  const [selectedUserType, setSelectedUserType] = useState<'admin_musee' | 'accueil' | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: ''
  })
  const [isCreating, setIsCreating] = useState(false)
  const [createdUsers, setCreatedUsers] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated || !hasPermission('manage_admin_musee')) {
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

  const generateUsername = (name: string, type: string) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '').slice(0, 6)
    const typePrefix = type === 'admin_musee' ? 'admin' : 'acc'
    const randomNum = Math.floor(Math.random() * 999) + 1
    return `${typePrefix}${cleanName}${randomNum}`
  }

  const handleCreateUser = () => {
    if (!formData.name) return
    
    const newUser = {
      id: Date.now().toString(),
      name: formData.name,
      museeId: 'musee-principal', // Musée unique
      username: formData.username || generateUsername(formData.name, selectedUserType!),
      password: formData.password || generatePassword(),
      role: selectedUserType,
      createdAt: new Date().toLocaleString('fr-FR')
    }

    setCreatedUsers([...createdUsers, newUser])
    setFormData({ name: '', username: '', password: '' })
    setSelectedUserType(null)
    setIsCreating(false)
  }

  const startCreation = (type: 'admin_musee' | 'accueil') => {
    setSelectedUserType(type)
    setIsCreating(true)
    // Pré-générer les credentials
    setFormData({
      ...formData,
      username: '',
      password: generatePassword()
    })
  }

  if (!isAuthenticated || !hasPermission('manage_admin_musee')) {
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
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Utilisateurs</h1>
            <p className="text-gray-600 mt-1">Créer et gérer les comptes utilisateurs du musée</p>
          </div>
        </div>

        {!isCreating ? (
          <>
            {/* Sélection du type d'utilisateur */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => startCreation('admin_musee')}>
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-3">
                    <div className="p-3 bg-blue-100 rounded-full">
                      <UserCheck className="h-8 w-8 text-blue-600" />
                    </div>
                  </div>
                  <CardTitle className="text-xl">Administrateur Musée</CardTitle>
                  <CardDescription>
                    Peut éditer les plans, gérer les agents d'accueil et les thématiques
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un Admin Musée
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => startCreation('accueil')}>
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-3">
                    <div className="p-3 bg-green-100 rounded-full">
                      <ShoppingCart className="h-8 w-8 text-green-600" />
                    </div>
                  </div>
                  <CardTitle className="text-xl">Agent Accueil/Vente</CardTitle>
                  <CardDescription>
                    Accès en consultation pour aider les visiteurs et la vente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un Agent
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Liste des utilisateurs créés */}
            {createdUsers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Utilisateurs Créés ({createdUsers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {createdUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                        <div className="flex-1">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-600">
                            {user.role === 'admin_musee' ? 'Administrateur Musée' : 'Agent Accueil/Vente'} - {user.museeId}
                          </div>
                          <div className="text-xs text-gray-500">Créé le {user.createdAt}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono bg-white px-2 py-1 rounded border">
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
                {selectedUserType === 'admin_musee' ? (
                  <UserCheck className="h-5 w-5 text-blue-600" />
                ) : (
                  <ShoppingCart className="h-5 w-5 text-green-600" />
                )}
                Créer un {selectedUserType === 'admin_musee' ? 'Administrateur Musée' : 'Agent Accueil/Vente'}
              </CardTitle>
              <CardDescription>
                Remplissez les informations pour créer le nouveau compte utilisateur
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
                      username: name ? generateUsername(name, selectedUserType!) : ''
                    })
                  }}
                  placeholder="Jean Dupont"
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

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={handleCreateUser}
                  disabled={!formData.name}
                  className="flex-1"
                >
                  Créer l'utilisateur
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsCreating(false)
                    setSelectedUserType(null)
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