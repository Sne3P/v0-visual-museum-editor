/**
 * API de gestion des utilisateurs
 * GET /api/auth/users - Liste tous les utilisateurs
 * POST /api/auth/users - Créer un nouvel utilisateur
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryPostgres } from '@/lib/database-postgres'

/**
 * GET - Récupérer tous les utilisateurs
 */
export async function GET(request: NextRequest) {
  try {
    const users = await queryPostgres<any>(`
      SELECT user_id, username, role, name, musee_id, is_active, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `)

    return NextResponse.json({
      success: true,
      users: users.map(u => ({
        id: u.user_id.toString(),
        username: u.username,
        role: u.role,
        name: u.name,
        museeId: u.musee_id,
        isActive: u.is_active,
        createdAt: u.created_at,
        lastLogin: u.last_login
      }))
    })

  } catch (error) {
    console.error('❌ Erreur récupération users:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST - Créer un nouvel utilisateur
 */
export async function POST(request: NextRequest) {
  try {
    const { username, password, role, name, museeId } = await request.json()

    // Validation
    if (!username || !password || !role || !name) {
      return NextResponse.json(
        { success: false, error: 'Tous les champs sont requis' },
        { status: 400 }
      )
    }

    // Vérifier que le role est valide
    if (!['super_admin', 'admin_musee', 'accueil'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Role invalide' },
        { status: 400 }
      )
    }

    // Vérifier si l'username existe déjà
    const existing = await queryPostgres<any>(`
      SELECT user_id FROM users WHERE username = $1
    `, [username])

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Ce nom d\'utilisateur existe déjà' },
        { status: 409 }
      )
    }

    // Pour simplifier, on stocke le mot de passe tel quel
    // (En production réelle, il faudrait utiliser bcrypt.hash())
    const result = await queryPostgres<any>(`
      INSERT INTO users (username, password_hash, role, name, musee_id, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING user_id, username, role, name, musee_id, created_at
    `, [username, password, role, name, museeId || null])

    const newUser = result[0]

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.user_id.toString(),
        username: newUser.username,
        role: newUser.role,
        name: newUser.name,
        museeId: newUser.musee_id,
        createdAt: newUser.created_at
      }
    })

  } catch (error) {
    console.error('❌ Erreur création user:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Supprimer un utilisateur
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('id')

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'ID utilisateur requis' },
        { status: 400 }
      )
    }

    // Ne pas permettre la suppression du super admin principal (user_id = 1)
    if (userId === '1') {
      return NextResponse.json(
        { success: false, error: 'Impossible de supprimer le super admin principal' },
        { status: 403 }
      )
    }

    await queryPostgres(`
      DELETE FROM users WHERE user_id = $1
    `, [parseInt(userId, 10)])

    return NextResponse.json({
      success: true,
      message: 'Utilisateur supprimé'
    })

  } catch (error) {
    console.error('❌ Erreur suppression user:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
