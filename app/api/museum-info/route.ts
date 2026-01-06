import { NextRequest, NextResponse } from 'next/server'
import { getPostgresPool } from '@/lib/database-postgres'

/**
 * GET /api/museum-info
 * Récupère les informations générales du musée
 */
export async function GET() {
  try {
    const pool = await getPostgresPool()
    const result = await pool.query(
      'SELECT museum_id, museum_name, main_image, opening_hours, created_at, updated_at FROM museum_info LIMIT 1'
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Informations du musée non trouvées' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Erreur lors de la récupération des informations du musée:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des informations' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/museum-info
 * Met à jour les informations générales du musée
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { museum_name, main_image, opening_hours } = body

    const pool = await getPostgresPool()

    // Construire la requête de mise à jour dynamiquement
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (museum_name !== undefined) {
      updates.push(`museum_name = $${paramIndex}`)
      values.push(museum_name)
      paramIndex++
    }

    if (main_image !== undefined) {
      updates.push(`main_image = $${paramIndex}`)
      values.push(main_image)
      paramIndex++
    }

    if (opening_hours !== undefined) {
      updates.push(`opening_hours = $${paramIndex}`)
      values.push(JSON.stringify(opening_hours))
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Aucune donnée à mettre à jour' },
        { status: 400 }
      )
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`)

    const query = `
      UPDATE museum_info 
      SET ${updates.join(', ')}
      WHERE museum_id = (SELECT museum_id FROM museum_info LIMIT 1)
      RETURNING museum_id, museum_name, main_image, opening_hours, updated_at
    `

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Échec de la mise à jour' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error) {
    console.error('Erreur lors de la mise à jour des informations du musée:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour' },
      { status: 500 }
    )
  }
}
