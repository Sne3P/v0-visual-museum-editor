import { NextRequest, NextResponse } from 'next/server'
import { runQuery, getRow } from '@/lib/database-sqlite'

export async function POST(request: NextRequest) {
  try {
    const { userId, userName } = await request.json()

    // Générer un token unique
    const generateToken = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let token = ''
      for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return token
    }

    let token = generateToken()
    let isUnique = false
    let attempts = 0
    
    // Vérifier l'unicité du token (max 5 tentatives)
    while (!isUnique && attempts < 5) {
      const existingToken = await getRow('SELECT token FROM qr_codes WHERE token = ?', [token])
      
      if (!existingToken) {
        isUnique = true
      } else {
        token = generateToken()
        attempts++
      }
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: 'Impossible de générer un token unique' },
        { status: 500 }
      )
    }

    // Insérer le nouveau token dans la base de données
    const result = await runQuery(
      'INSERT INTO qr_codes (token, created_by, is_used) VALUES (?, ?, 0)',
      [token, userName]
    )
    
    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Erreur lors de la création du token' },
        { status: 500 }
      )
    }

    // Récupérer les détails du token créé
    const createdToken = await getRow(
      'SELECT token, created_at FROM qr_codes WHERE id = ?',
      [result.lastID]
    )

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const qrUrl = `${baseUrl}/audioguide?token=${token}`

    return NextResponse.json({
      success: true,
      token: token,
      url: qrUrl,
      createdAt: createdToken.created_at
    })

  } catch (error) {
    console.error('Erreur génération QR code:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la génération du QR code' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token manquant' },
        { status: 400 }
      )
    }

    // Vérifier le token dans la base de données
    const qrData = await getRow(
      'SELECT token, created_by, created_at, is_used, used_at FROM qr_codes WHERE token = ?',
      [token]
    )

    if (!qrData) {
      return NextResponse.json(
        { error: 'Token invalide' },
        { status: 404 }
      )
    }

    if (qrData.is_used === 1) {
      return NextResponse.json(
        { 
          error: 'Token déjà utilisé', 
          usedAt: qrData.used_at 
        },
        { status: 410 }
      )
    }

    return NextResponse.json({
      valid: true,
      token: qrData.token,
      createdBy: qrData.created_by,
      createdAt: qrData.created_at
    })

  } catch (error) {
    console.error('Erreur vérification token:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la vérification du token' },
      { status: 500 }
    )
  }
}