"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { MuseumEditor } from '@/components/museum-editor'

export default function EditorPage() {
  const { isAuthenticated, hasPermission, currentUser, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/login')
      } else if (!hasPermission('edit_maps')) {
        // Rediriger les utilisateurs sans permission d'édition
        if (currentUser?.role === 'accueil') {
          router.push('/accueil')
        } else {
          router.push('/admin')
        }
      }
    }
  }, [isAuthenticated, hasPermission, currentUser, isLoading, router])

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">
            {isLoading ? 'Chargement de la session...' : 'Redirection vers la page de connexion...'}
          </p>
        </div>
      </div>
    )
  }

  if (!hasPermission('edit_maps')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Accès non autorisé. Redirection...</p>
        </div>
      </div>
    )
  }

  return <MuseumEditor />
}