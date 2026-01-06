"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (login(username, password)) {
      router.push('/admin')
    } else {
      setError('Identifiants incorrects. Vérifiez les comptes de démonstration ci-dessous.')
    }
  }

  const quickAdminLogin = () => {
    setUsername('admin')
    setPassword('admin123')
    if (login('admin', 'admin123')) {
      router.push('/admin')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Administration MuseumVoice</CardTitle>
          <CardDescription>
            Connectez-vous pour accéder au panneau d'administration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Identifiant</Label>
              <Input
                id="username"
                type="text"
                placeholder="Entrez votre identifiant"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="Entrez votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <Button type="submit" className="w-full">
              Se connecter
            </Button>

            <Button 
              type="button" 
              variant="outline" 
              className="w-full mt-2"
              onClick={quickAdminLogin}
            >
              🚀 Connexion Admin Rapide
            </Button>
          </form>
          
          <div className="mt-4 text-sm text-gray-600 text-center">
            <p className="font-medium mb-2">Comptes de démonstration :</p>
            <div className="space-y-1 text-xs">
              <p><strong>Admin Principal:</strong> admin / admin123</p>
              <p><strong>Admin Musée:</strong> musee1 / musee123</p>
              <p><strong>Agent Accueil:</strong> accueil1 / accueil123</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}