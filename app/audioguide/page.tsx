"use client"

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, Clock, PlayCircle, AlertTriangle } from 'lucide-react'

export default function AudioguidePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'used' | 'activated'>('checking')
  const [tokenData, setTokenData] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (token) {
      checkToken(token)
    } else {
      setStatus('invalid')
      setError('Aucun token fourni')
    }
  }, [token])

  const checkToken = async (token: string) => {
    try {
      const response = await fetch(`/api/qrcode?token=${token}`)
      const data = await response.json()

      if (response.ok) {
        setTokenData(data)
        setStatus('valid')
      } else {
        setError(data.error)
        if (response.status === 410) {
          setStatus('used')
        } else {
          setStatus('invalid')
        }
      }
    } catch (error) {
      console.error('Erreur vérification token:', error)
      setError('Erreur de connexion')
      setStatus('invalid')
    }
  }

  const activateAudioguide = async () => {
    if (!token) return

    try {
      const response = await fetch('/api/qrcode/use', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('activated')
        setTokenData(data.data)
      } else {
        setError(data.error)
        setStatus('invalid')
      }
    } catch (error) {
      console.error('Erreur activation:', error)
      setError('Erreur lors de l\'activation')
    }
  }

  const renderContent = () => {
    switch (status) {
      case 'checking':
        return (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <Clock className="h-16 w-16 mx-auto text-blue-500 animate-spin" />
              <CardTitle className="text-2xl">Vérification en cours...</CardTitle>
              <CardDescription>
                Validation de votre token d'accès à l'audioguide
              </CardDescription>
            </CardHeader>
          </Card>
        )

      case 'valid':
        return (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
              <CardTitle className="text-2xl">Token Valide !</CardTitle>
              <CardDescription>
                Votre accès à l'audioguide est prêt à être activé
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">Informations du token</h3>
                <div className="text-sm text-green-700 space-y-1">
                  <p><strong>Token:</strong> {tokenData?.token}</p>
                  <p><strong>Créé par:</strong> {tokenData?.createdBy}</p>
                  <p><strong>Créé le:</strong> {new Date(tokenData?.createdAt).toLocaleString('fr-FR')}</p>
                </div>
              </div>

              <div className="text-center">
                <Button 
                  onClick={activateAudioguide}
                  size="lg"
                  className="flex items-center gap-2"
                >
                  <PlayCircle className="h-5 w-5" />
                  Activer l'Audioguide
                </Button>
              </div>

              <div className="text-xs text-gray-600 text-center">
                <p>⚠️ Une fois activé, ce token ne pourra plus être réutilisé</p>
              </div>
            </CardContent>
          </Card>
        )

      case 'activated':
        return (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <PlayCircle className="h-16 w-16 mx-auto text-blue-500" />
              <CardTitle className="text-2xl">Audioguide Activé !</CardTitle>
              <CardDescription>
                Bienvenue dans l'expérience audioguide du musée
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">Session activée</h3>
                <div className="text-sm text-blue-700 space-y-1">
                  <p><strong>Token:</strong> {tokenData?.token}</p>
                  <p><strong>Créé par:</strong> {tokenData?.createdBy}</p>
                  <p><strong>Activé le:</strong> {new Date(tokenData?.usedAt).toLocaleString('fr-FR')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="outline" className="w-full">
                  🎧 Commencer la visite
                </Button>
                <Button variant="outline" className="w-full">
                  🗺️ Plan interactif
                </Button>
                <Button variant="outline" className="w-full">
                  📚 Thématiques
                </Button>
                <Button variant="outline" className="w-full">
                  ℹ️ Informations pratiques
                </Button>
              </div>

              <div className="text-center text-sm text-gray-600">
                <p>🎉 Profitez bien de votre visite !</p>
              </div>
            </CardContent>
          </Card>
        )

      case 'used':
        return (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <AlertTriangle className="h-16 w-16 mx-auto text-orange-500" />
              <CardTitle className="text-2xl">Token Déjà Utilisé</CardTitle>
              <CardDescription>
                Ce token d'audioguide a déjà été activé
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-orange-800">
                  {error}
                </p>
              </div>
              <p className="text-gray-600">
                Veuillez demander un nouveau QR code à l'accueil du musée.
              </p>
            </CardContent>
          </Card>
        )

      case 'invalid':
      default:
        return (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <XCircle className="h-16 w-16 mx-auto text-red-500" />
              <CardTitle className="text-2xl">Token Invalide</CardTitle>
              <CardDescription>
                Impossible d'accéder à l'audioguide avec ce token
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-red-800">
                  {error || 'Le token fourni n\'est pas valide'}
                </p>
              </div>
              <p className="text-gray-600">
                Veuillez scanner un QR code valide ou demander de l'aide à l'accueil.
              </p>
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🏛️ MuseumVoice Audioguide
          </h1>
          <p className="text-gray-600">
            Accès sécurisé à l'expérience audioguide du musée
          </p>
        </div>
        
        {renderContent()}
      </div>
    </div>
  )
}