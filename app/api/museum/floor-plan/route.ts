import { NextRequest, NextResponse } from 'next/server'

// Helper pour ajouter les headers CORS
function addCORSHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return response
}

/**
 * OPTIONS /api/museum/floor-plan
 * Gérer les preflight requests CORS
 */
export async function OPTIONS() {
  return addCORSHeaders(
    new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  )
}

/**
 * GET /api/museum/floor-plan
 * Proxy vers le backend Flask pour récupérer le plan du musée
 */
export async function GET(request: NextRequest) {
  try {
    const BACKEND_URL = process.env.BACKEND_API_URL || 'http://backend:5000'
    const floor = request.nextUrl.searchParams.get('floor')
    
    // Construire l'URL avec les paramètres optionnels
    const backendUrl = new URL(`${BACKEND_URL}/api/museum/floor-plan`)
    if (floor) {
      backendUrl.searchParams.set('floor', floor)
    }
    
    console.log(`[floor-plan] Fetching from backend: ${backendUrl.toString()}`)
    
    const response = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('[floor-plan] Backend error:', data)
      return addCORSHeaders(NextResponse.json(
        { success: false, error: data.error || 'Backend error' },
        { status: response.status }
      ))
    }

    console.log('[floor-plan] Successfully retrieved floor plan with', data.rooms?.length, 'rooms')
    return addCORSHeaders(NextResponse.json(data))
    
  } catch (error: any) {
    console.error('[floor-plan] Error:', error)
    return addCORSHeaders(NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch floor plan' },
      { status: 500 }
    ))
  }
}
