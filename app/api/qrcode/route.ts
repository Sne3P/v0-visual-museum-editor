import { NextRequest, NextResponse } from 'next/server'
import { queryPostgres } from '@/lib/database-postgres'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { userId, userName = 'system' } = body

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
    
    while (!isUnique && attempts < 5) {
      const existingTokens = await queryPostgres<any>('SELECT token FROM qr_code WHERE token = $1', [token])
      
      if (existingTokens.length === 0) {
        isUnique = true
      } else {
        token = generateToken()
        attempts++
      }
    }

    if (!isUnique) {
      return NextResponse.json({ error: 'Impossible de générer un token unique' }, { status: 500 })
    }

    await queryPostgres(
      "INSERT INTO qr_code (token, created_by, is_used, expires_at) VALUES ($1, $2, 0, NOW() + INTERVAL '8 hours')",
      [token, userName]
    )

    const createdTokens = await queryPostgres<any>(
      'SELECT token, created_at, expires_at FROM qr_code WHERE token = $1',
      [token]
    )

    // Rediriger vers le frontend client React (port 8080)
    // En production: configure NEXT_PUBLIC_CLIENT_URL dans docker-compose ou .env
    const baseUrl = process.env.NEXT_PUBLIC_CLIENT_URL || 'http://localhost:8080'
    const qrUrl = `${baseUrl}/?token=${token}`

    return NextResponse.json({
      success: true,
      token: token,
      url: qrUrl,
      createdAt: createdTokens[0].created_at
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })

  } catch (error) {
    console.error('Erreur génération QR code:', error)
    return NextResponse.json({ error: 'Erreur serveur lors de la génération du QR code' }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 400 })
    }

    const tokens = await queryPostgres<any>(
      'SELECT token, created_by, created_at, is_used, used_at, expires_at FROM qr_code WHERE token = $1',
      [token]
    )

    if (tokens.length === 0) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
    }

    const tokenData = tokens[0]
    
    // Vérifier si le token a expiré
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expiré' }, { status: 410 })
    }

    return NextResponse.json({ token: tokenData }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })

  } catch (error) {
    console.error('Erreur récupération token:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}
