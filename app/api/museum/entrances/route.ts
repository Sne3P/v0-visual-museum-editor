import { NextRequest, NextResponse } from 'next/server'
import { queryPostgres } from '@/lib/database-postgres'

/**
 * GET /api/museum/entrances
 * Récupère tous les points d'entrée
 */
export async function GET() {
  try {
    const entrances = await queryPostgres<any>(`
      SELECT 
        e.entrance_id,
        e.plan_id,
        e.name,
        e.x,
        e.y,
        e.icon,
        e.is_active,
        p.nom as plan_name
      FROM museum_entrances e
      LEFT JOIN plans p ON e.plan_id = p.plan_id
      ORDER BY e.plan_id, e.entrance_id
    `)

    return NextResponse.json({
      success: true,
      entrances
    })
  } catch (error: any) {
    console.error('Error fetching entrances:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/museum/entrances
 * Ajoute un nouveau point d'entrée
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    let { plan_id, name, x, y, icon } = body

    if (x === undefined || y === undefined) {
      return NextResponse.json(
        { success: false, error: 'x et y sont requis' },
        { status: 400 }
      )
    }

    // Si aucun plan_id fourni, créer ou récupérer le plan par défaut
    if (!plan_id) {
      const plans = await queryPostgres<any>('SELECT plan_id FROM plans ORDER BY plan_id LIMIT 1')
      
      if (plans.length === 0) {
        // Créer un plan par défaut
        const newPlan = await queryPostgres<any>(`
          INSERT INTO plans (nom, description)
          VALUES ($1, $2)
          RETURNING plan_id
        `, ['RDC', 'Rez-de-chaussée'])
        plan_id = newPlan[0].plan_id
      } else {
        plan_id = plans[0].plan_id
      }
    }

    // Vérifier si une entrée existe déjà à proximité (rayon de 50 unités)
    const MIN_DISTANCE = 50
    const nearbyEntrances = await queryPostgres<any>(`
      SELECT entrance_id, x, y,
        SQRT(POWER(x - $1, 2) + POWER(y - $2, 2)) as distance
      FROM museum_entrances
      WHERE plan_id = $3
      HAVING SQRT(POWER(x - $1, 2) + POWER(y - $2, 2)) < $4
    `, [x, y, plan_id, MIN_DISTANCE])

    if (nearbyEntrances.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Une entrée existe déjà à proximité (${Math.round(nearbyEntrances[0].distance)} unités). Distance minimale: ${MIN_DISTANCE} unités.`
        },
        { status: 400 }
      )
    }

    const result = await queryPostgres<any>(`
      INSERT INTO museum_entrances (plan_id, name, x, y, icon)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [plan_id, name || 'Entrée principale', x, y, icon || 'door-open'])

    return NextResponse.json({
      success: true,
      entrance: result[0]
    })
  } catch (error: any) {
    console.error('Error creating entrance:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/museum/entrances
 * Supprime un point d'entrée
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entranceId = searchParams.get('id')

    if (!entranceId) {
      return NextResponse.json(
        { success: false, error: 'entrance_id requis' },
        { status: 400 }
      )
    }

    await queryPostgres(`
      DELETE FROM museum_entrances WHERE entrance_id = $1
    `, [entranceId])

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting entrance:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
