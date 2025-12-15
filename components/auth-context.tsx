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
  login: (username: string, password: string) => boolean
  logout: () => void
  hasPermission: (action: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Base de données simulée des utilisateurs
const USERS_DB: User[] = [
  {
    id: '1',
    username: 'admin',
    role: 'super_admin',
    name: 'Administrateur Principal'
  },
  {
    id: '2',
    username: 'musee1',
    role: 'admin_musee',
    name: 'Admin Musée Louvre',
    museeId: 'louvre'
  },
  {
    id: '3',
    username: 'accueil1',
    role: 'accueil',
    name: 'Vendeur Accueil',
    museeId: 'louvre'
  }
]

const USER_PASSWORDS: Record<string, string> = {
  'admin': 'admin123',
  'musee1': 'musee123',
  'accueil1': 'accueil123'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Vérifier si l'utilisateur est déjà connecté au chargement
    console.log('🔐 Vérification de l\'authentification au chargement')
    const authData = localStorage.getItem('museum-auth-data')
    console.log('📱 Données d\'auth trouvées:', !!authData)
    
    if (authData) {
      try {
        const userData = JSON.parse(authData)
        console.log('✅ Utilisateur restauré:', userData.username, userData.role)
        setCurrentUser(userData)
        setIsAuthenticated(true)
      } catch (error) {
        console.error('❌ Erreur lors du parsing des données d\'auth:', error)
        localStorage.removeItem('museum-auth-data')
      }
    } else {
      console.log('ℹ️ Aucune session trouvée')
    }
    setIsLoading(false)
  }, [])

  const login = (username: string, password: string): boolean => {
    const user = USERS_DB.find(u => u.username === username)
    if (user && USER_PASSWORDS[username] === password) {
      setCurrentUser(user)
      setIsAuthenticated(true)
      localStorage.setItem('museum-auth-data', JSON.stringify(user))
      return true
    }
    return false
  }

  const logout = () => {
    setIsAuthenticated(false)
    setCurrentUser(null)
    localStorage.removeItem('museum-auth-data')
  }

  const hasPermission = (action: string): boolean => {
    if (!currentUser) return false
    
    const permissions: Record<UserRole, string[]> = {
      super_admin: ['edit_maps', 'manage_admin_musee', 'manage_themes', 'system_settings'],
      admin_musee: ['edit_maps', 'manage_accueil', 'manage_themes'],
      accueil: ['view_only']
    }
    
    return permissions[currentUser.role]?.includes(action) || false
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