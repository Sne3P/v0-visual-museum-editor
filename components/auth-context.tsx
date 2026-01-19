"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'super_admin' | 'admin_musee' | 'accueil'

export interface User {
  id: string
  username: string
  role: UserRole
  name: string
  museeId?: string // Pour les admin_musee et accueil
}

interface AuthContextType {
  isAuthenticated: boolean
  currentUser: User | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  hasPermission: (action: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Vérifier si l'utilisateur est déjà connecté au chargement
    console.log('🔐 Vérification de l\'authentification au chargement')
    
    // Vérifier que nous sommes bien côté client
    if (typeof window === 'undefined') {
      console.log('⚠️ Pas côté client, skip restoration')
      setIsLoading(false)
      return
    }

    try {
      const authData = localStorage.getItem('museum-auth-data')
      console.log('📱 Données d\'auth trouvées:', !!authData)
      
      if (authData) {
        const userData = JSON.parse(authData)
        console.log('✅ Utilisateur restauré:', userData.username, userData.role)
        setCurrentUser(userData)
        setIsAuthenticated(true)
      } else {
        console.log('ℹ️ Aucune session trouvée dans localStorage')
      }
    } catch (error) {
      console.error('❌ Erreur lors de la restauration de session:', error)
      try {
        localStorage.removeItem('museum-auth-data')
      } catch (e) {
        console.error('❌ Impossible de nettoyer localStorage:', e)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      console.log('🔐 Tentative de connexion pour:', username)
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (response.ok && data.success && data.user) {
        const user = data.user
        console.log('✅ Login réussi pour:', username, 'Role:', user.role)
        
        setCurrentUser(user)
        setIsAuthenticated(true)
        
        // Sauvegarder dans localStorage
        try {
          const userDataStr = JSON.stringify(user)
          localStorage.setItem('museum-auth-data', userDataStr)
          console.log('💾 Session sauvegardée dans localStorage')
        } catch (error) {
          console.error('❌ Erreur lors de la sauvegarde dans localStorage:', error)
        }
        
        return true
      }

      console.log('❌ Login échoué:', data.error || 'Identifiants incorrects')
      return false

    } catch (error) {
      console.error('❌ Erreur réseau lors du login:', error)
      return false
    }
  }

  const logout = () => {
    console.log('🚪 Déconnexion de l\'utilisateur')
    setIsAuthenticated(false)
    setCurrentUser(null)
    try {
      localStorage.removeItem('museum-auth-data')
      console.log('💾 Session supprimée de localStorage')
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de localStorage:', error)
    }
  }

  const hasPermission = (action: string): boolean => {
    if (!currentUser) {
      console.log('❌ hasPermission: Pas d\'utilisateur connecté')
      return false
    }
    
    const permissions: Record<UserRole, string[]> = {
      super_admin: [
        'edit_maps', 
        'manage_admin_musee',  // Gérer TOUS les utilisateurs (admin_musee + accueil)
        'manage_themes', 
        'system_settings',
        'manage_profils'       // Gestion des critères et profils
      ],
      admin_musee: [
        'edit_maps', 
        'manage_accueil',      // Gérer uniquement les agents d'accueil
        'manage_themes',
        'manage_profils'
      ],
      accueil: ['view_only']
    }
    
    const hasAccess = permissions[currentUser.role]?.includes(action) || false
    console.log(`🔐 hasPermission("${action}") pour ${currentUser.role}:`, hasAccess)
    return hasAccess
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}