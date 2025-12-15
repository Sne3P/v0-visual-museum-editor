"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'

export default function Home() {
  const { isAuthenticated, currentUser, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && currentUser) {
        // Redirection selon le rôle de l'utilisateur
        if (currentUser.role === 'accueil') {
          router.push('/accueil')
        } else {
          router.push('/admin')
        }
      } else {
        router.push('/login')
      }
    }
  }, [isAuthenticated, currentUser, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Chargement de la session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg">Redirection en cours...</p>
      </div>
    </div>
  )
}
