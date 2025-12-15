"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, LogOut, Info, MapPin, QrCode } from 'lucide-react'

export default function AccueilPage() {
  const { isAuthenticated, logout, currentUser } = useAuth()
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

  if (!isAuthenticated || !currentUser) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Interface Agent d'Accueil</h1>
            <p className="text-gray-600 mt-2">
              {currentUser.name} - Agent d'Accueil
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Plans du Musée</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Consulter les plans et itinéraires du musée pour renseigner les visiteurs
              </CardDescription>
              <Button variant="outline" className="w-full" disabled>
                Bientôt disponible
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">QR Code Audioguide</CardTitle>
              <QrCode className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Générer des QR codes pour les visiteurs qui souhaitent l'audioguide
              </CardDescription>
              <Button 
                onClick={() => router.push('/admin/qrcode')} 
                className="w-full"
              >
                Générer QR Code
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Informations Visiteurs</CardTitle>
              <Info className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Accès aux informations pratiques et thématiques du musée
              </CardDescription>
              <Button variant="outline" className="w-full" disabled>
                Bientôt disponible
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Consultation</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Mode consultation des contenus du musée
              </CardDescription>
              <Button variant="outline" className="w-full" disabled>
                Bientôt disponible
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Informations sur le compte */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du Compte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Agent:</span> {currentUser.name}
              </div>
              <div>
                <span className="font-medium">Rôle:</span> Agent d'Accueil
              </div>
              <div>
                <span className="font-medium">Musée:</span> {currentUser.museeId}
              </div>
              <div>
                <span className="font-medium">Identifiant:</span> {currentUser.username}
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Permissions:</strong> Vous avez accès en consultation seulement. 
                Pour toute modification, veuillez contacter l'administrateur du musée.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}