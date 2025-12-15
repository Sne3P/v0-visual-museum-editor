import { NextRequest, NextResponse } from 'next/server'
import { runQuery, getRow } from '@/lib/database-sqlite'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Token manquant' },
        { status: 400 }
      )
    }

    // Vérifier que le token existe et n'est pas déjà utilisé
    const existingToken = await getRow(
      'SELECT token, created_by, created_at, is_used FROM qr_codes WHERE token = ?',
      [token]
    )

    if (!existingToken) {
      return NextResponse.json(
        { error: 'Token invalide' },
        { status: 400 }
      )
    }

    if (existingToken.is_used === 1) {
      return NextResponse.json(
        { error: 'Token déjà utilisé' },
        { status: 400 }
      )
    }

    // Marquer le token comme utilisé
    const result = await runQuery(
      'UPDATE qr_codes SET is_used = 1, used_at = CURRENT_TIMESTAMP WHERE token = ?',
      [token]
    )
    
    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du token' },
        { status: 500 }
      )
    }

    // Récupérer les données mises à jour
    const updatedToken = await getRow(
      'SELECT token, created_by, created_at, used_at FROM qr_codes WHERE token = ?',
      [token]
    )

    return NextResponse.json({
      success: true,
      message: 'Token utilisé avec succès',
      data: {
        token: updatedToken.token,
        createdBy: updatedToken.created_by,
        createdAt: updatedToken.created_at,
        usedAt: updatedToken.used_at
      }
    })

  } catch (error) {
    console.error('Erreur utilisation token:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de l\'utilisation du token' },
      { status: 500 }
    )
  }
}