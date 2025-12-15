"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Edit, Users, FileText, LogOut, QrCode } from 'lucide-react'

export default function AdminPage() {
  const { isAuthenticated, logout, currentUser, hasPermission } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleGoToEditor = () => {
    router.push('/editor')
  }

  if (!isAuthenticated || !currentUser) {
    return null // ou un spinner de chargement
  }

  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Administrateur Principal'
      case 'admin_musee': return 'Administrateur Musée'
      case 'accueil': return 'Agent d\'Accueil'
      default: return 'Utilisateur'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Panneau d'Administration</h1>
            <p className="text-gray-600 mt-2">
              {currentUser.name} - {getRoleDisplay(currentUser.role)}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Éditeur - Visible pour super_admin et admin_musee */}
          {hasPermission('edit_maps') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Éditeur de Musée</CardTitle>
                <Edit className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Accédez à l'éditeur principal pour créer et modifier les plans de musée
                </CardDescription>
                <Button onClick={handleGoToEditor} className="w-full">
                  Ouvrir l'éditeur
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Gestion Utilisateurs Musée - Visible seulement pour super_admin */}
          {hasPermission('manage_admin_musee') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gestion Utilisateurs Musée</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Créer des comptes administrateurs ou agents d'accueil/vente
                </CardDescription>
                <Button 
                  onClick={() => router.push('/admin/users')} 
                  className="w-full"
                >
                  Gérer les utilisateurs
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Gestion Accueil - Visible pour admin_musee */}
          {hasPermission('manage_accueil') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gestion Agents Accueil</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Créer et gérer les comptes des agents d'accueil/vendeurs
                </CardDescription>
                <Button 
                  onClick={() => router.push('/admin/accueil-users')} 
                  className="w-full"
                >
                  Gérer les agents
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Thématiques - Visible pour super_admin et admin_musee */}
          {hasPermission('manage_themes') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Thématiques</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Gérer les thématiques du musée (peinture, contemporain, sculpture, etc.)
                </CardDescription>
                <Button variant="outline" className="w-full" disabled>
                  Bientôt disponible
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Générateur QR Code - Visible pour admin_musee et accueil */}
          {(hasPermission('edit_maps') || hasPermission('manage_accueil') || hasPermission('view_only')) && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">QR Code Audioguide</CardTitle>
                <QrCode className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Générer des QR codes pour l'audioguide du musée
                </CardDescription>
                <Button 
                  onClick={() => router.push('/admin/qrcode')} 
                  className="w-full"
                >
                  Générer QR Code
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Paramètres Système - Visible seulement pour super_admin */}
          {hasPermission('system_settings') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Paramètres Système</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Configurer les paramètres globaux de l'application
                </CardDescription>
                <Button variant="outline" className="w-full" disabled>
                  Bientôt disponible
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Informations sur le compte */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Informations du Compte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Utilisateur:</span> {currentUser.name}
              </div>
              <div>
                <span className="font-medium">Rôle:</span> {getRoleDisplay(currentUser.role)}
              </div>
              {currentUser.museeId && (
                <div>
                  <span className="font-medium">Musée:</span> {currentUser.museeId}
                </div>
              )}
              <div>
                <span className="font-medium">Identifiant:</span> {currentUser.username}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}