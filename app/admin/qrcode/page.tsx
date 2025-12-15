"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, QrCode, Download, Copy, RefreshCw } from 'lucide-react'
import QRCodeLib from 'qrcode'

export default function QRCodePage() {
  const { isAuthenticated, currentUser, hasPermission } = useAuth()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrCodeData, setQrCodeData] = useState('')
  const [tokenData, setTokenData] = useState<any>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated || (!hasPermission('edit_maps') && !hasPermission('manage_accueil') && !hasPermission('view_only'))) {
      router.push('/admin')
    }
  }, [isAuthenticated, hasPermission, router])

  const generateQRCode = async () => {
    setIsGenerating(true)
    setError('')
    
    try {
      // Appeler l'API pour créer un nouveau token
      const response = await fetch('/api/qrcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser?.id,
          userName: currentUser?.username
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la génération du token')
      }

      setTokenData(data)
      
      // Générer le QR code avec l'URL retournée
      if (canvasRef.current && data.url) {
        await QRCodeLib.toCanvas(canvasRef.current, data.url, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
        setQrCodeData(data.url)
      }
      
    } catch (error) {
      console.error('Erreur lors de la génération du QR code:', error)
      setError(error instanceof Error ? error.message : 'Erreur inconnue')
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadQRCode = () => {
    if (canvasRef.current) {
      const link = document.createElement('a')
      link.download = `qrcode-audioguide-${Date.now()}.png`
      link.href = canvasRef.current.toDataURL()
      link.click()
    }
  }

  const copyToClipboard = async () => {
    if (qrCodeData) {
      try {
        await navigator.clipboard.writeText(qrCodeData)
        alert('URL copiée dans le presse-papiers!')
      } catch (error) {
        console.error('Erreur lors de la copie:', error)
      }
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Génération de QR Code</h1>
            <p className="text-gray-600 mt-1">Créer des QR codes pour l'audioguide du musée</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Paramètres */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Paramètres du QR Code
              </CardTitle>
              <CardDescription>
                Configurez l'URL et les paramètres pour générer le QR code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Informations du compte</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p><strong>Utilisateur:</strong> {currentUser?.name}</p>
                  <p><strong>Rôle:</strong> {currentUser?.role === 'super_admin' ? 'Admin Principal' : currentUser?.role === 'admin_musee' ? 'Admin Musée' : 'Agent Accueil'}</p>
                  <p><strong>Identifiant:</strong> {currentUser?.username}</p>
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Fonctionnement</h4>
                <div className="text-sm text-green-800 space-y-1">
                  <p>• Chaque QR code génère un token unique stocké en base</p>
                  <p>• Le visiteur accède à l'audioguide via le token</p>
                  <p>• Une fois utilisé, le token devient invalide</p>
                  <p>• Traçabilité complète des accès</p>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>Erreur:</strong> {error}
                  </p>
                </div>
              )}

              <Button 
                onClick={generateQRCode} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? 'Génération du token...' : 'Générer un Nouveau QR Code'}
              </Button>
            </CardContent>
          </Card>

          {/* Aperçu et téléchargement */}
          <Card>
            <CardHeader>
              <CardTitle>QR Code Généré</CardTitle>
              <CardDescription>
                Aperçu et options de téléchargement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg">
                  <canvas
                    ref={canvasRef}
                    className={qrCodeData ? 'block' : 'hidden'}
                  />
                  {!qrCodeData && (
                    <div className="w-[300px] h-[300px] flex items-center justify-center text-gray-400">
                      <QrCode className="h-16 w-16" />
                    </div>
                  )}
                </div>
              </div>

              {qrCodeData && tokenData && (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium mb-2">Détails du token:</p>
                    <div className="text-xs space-y-1">
                      <p><strong>Token:</strong> <span className="font-mono">{tokenData.token}</span></p>
                      <p><strong>URL:</strong> <span className="font-mono break-all text-gray-600">{qrCodeData}</span></p>
                      <p><strong>Créé le:</strong> {new Date(tokenData.createdAt).toLocaleString('fr-FR')}</p>
                      <p><strong>Statut:</strong> <span className="text-green-600">Actif (non utilisé)</span></p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={downloadQRCode} className="flex-1">
                      <Download className="h-4 w-4 mr-2" />
                      Télécharger PNG
                    </Button>
                    <Button onClick={copyToClipboard} variant="outline" className="flex-1">
                      <Copy className="h-4 w-4 mr-2" />
                      Copier URL
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <p><strong>Utilisation:</strong></p>
                <p>• Imprimez le QR code sur des supports physiques</p>
                <p>• Les visiteurs scannent pour accéder à l'audioguide</p>
                <p>• Le token permet de tracer l'utilisation</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}