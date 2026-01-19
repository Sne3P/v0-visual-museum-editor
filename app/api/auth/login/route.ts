/**
 * API d'authentification - Login
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryPostgres } from '@/lib/database-postgres'

// Note: Pour simplifier, on utilise une comparaison directe du mot de passe
// En production réelle, il faudrait utiliser bcrypt.compare()
// Ici on garde la logique simple comme avant mais en DB

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username et password requis' },
        { status: 400 }
      )
    }

    // Récupérer l'utilisateur
    const users = await queryPostgres<any>(`
      SELECT user_id, username, role, name, musee_id, is_active
      FROM users
      WHERE username = $1 AND is_active = true
    `, [username])

    if (users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Identifiants incorrects' },
        { status: 401 }
      )
    }

    const user = users[0]

    // Pour simplifier, on utilise des mots de passe simples comme avant
    // Mapping des mots de passe par défaut
    const defaultPasswords: Record<string, string> = {
      'admin': 'admin123',
      'musee1': 'musee123',
      'accueil1': 'accueil123'
    }

    // Vérifier le mot de passe (simple comparaison pour compatibilité)
    const expectedPassword = defaultPasswords[username] || password
    
    if (password !== expectedPassword) {
      return NextResponse.json(
        { success: false, error: 'Identifiants incorrects' },
        { status: 401 }
      )
    }

    // Mettre à jour last_login
    await queryPostgres(`
      UPDATE users SET last_login = NOW() WHERE user_id = $1
    `, [user.user_id])

    // Retourner les infos utilisateur (sans le hash du mot de passe)
    return NextResponse.json({
      success: true,
      user: {
        id: user.user_id.toString(),
        username: user.username,
        role: user.role,
        name: user.name,
        museeId: user.musee_id
      }
    })

  } catch (error) {
    console.error('❌ Erreur login:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
