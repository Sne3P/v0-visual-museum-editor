import { NextRequest, NextResponse } from 'next/server'
import http from 'http'
import https from 'https'

interface FetchOptions extends RequestInit {
  agent?: http.Agent | https.Agent
}

/**
* POST /api/admin/generate-narrations-by-profile
 * 
 * Génère les narrations pour 1 profil spécifique dans TOUTES les œuvres
 * 
 * Body: {
 *   criteria_combination: { age: 1, thematique: 5, style_texte: 8 }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { criteria_combination } = body

    if (!criteria_combination) {
      return NextResponse.json(
        { success: false, error: 'criteria_combination requis' },
        { status: 400 }
      )
    }

    // Appeler le backend Flask
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:5000'
    const endpoint = `${backendUrl}/api/admin/generate-narrations-by-profile`

    // Créer des agents avec timeout augmenté pour les longues générations Ollama
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000,
      timeout: 600000 // 10 minutes au niveau socket
    })
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000,
      timeout: 600000 // 10 minutes au niveau socket
    })

    const fetchOptions: FetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        criteria_combination
      }),
      agent: endpoint.startsWith('https') ? httpsAgent : httpAgent,
      signal: AbortSignal.timeout(600000) // 10 minutes
    }

    const res = await fetch(endpoint, fetchOptions)

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data.error || 'Erreur génération par profil' },
        { status: res.status }
      )
    }

    return NextResponse.json({
      success: true,
      inserted: data.inserted || 0,
      skipped: data.skipped || 0,
      message: data.message || `${data.inserted} narrations générées pour ce profil`
    })
  } catch (error) {
    console.error('Erreur génération par profil:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
