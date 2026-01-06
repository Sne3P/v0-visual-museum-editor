import { NextRequest, NextResponse } from 'next/server'
import { getPostgresPool } from '@/lib/database-postgres'

/**
 * GET /api/centres-interets
 * Récupère tous les centres d'intérêts ou un centre spécifique
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const centreId = searchParams.get('id')

    const pool = await getPostgresPool()

    if (centreId) {
      const result = await pool.query(
        'SELECT * FROM centres_interets WHERE centre_id = $1',
        [centreId]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Centre d\'intérêt non trouvé' },
          { status: 404 }
        )
      }

      return NextResponse.json(result.rows[0])
    } else {
      const result = await pool.query(
        'SELECT * FROM centres_interets ORDER BY created_at ASC'
      )
      return NextResponse.json(result.rows)
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des centres d\'intérêts:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/centres-interets
 * Crée un nouveau centre d'intérêt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, ai_indication, image } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Le nom est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      `INSERT INTO centres_interets (name, description, ai_indication, image) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name, description || null, ai_indication || null, image || null]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    }, { status: 201 })
  } catch (error: any) {
    console.error('Erreur lors de la création du centre d\'intérêt:', error)
    
    if (error.code === '23505') { // Duplicate key
      return NextResponse.json(
        { error: 'Un centre d\'intérêt avec ce nom existe déjà' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/centres-interets
 * Met à jour un centre d'intérêt
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { centre_id, name, description, ai_indication, image } = body

    if (!centre_id) {
      return NextResponse.json(
        { error: 'L\'ID du centre d\'intérêt est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      `UPDATE centres_interets 
       SET name = $1, description = $2, ai_indication = $3, image = $4, updated_at = CURRENT_TIMESTAMP
       WHERE centre_id = $5
       RETURNING *`,
      [name, description || null, ai_indication || null, image || null, centre_id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Centre d\'intérêt non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du centre d\'intérêt:', error)
    
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Un centre d\'intérêt avec ce nom existe déjà' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/centres-interets
 * Supprime un centre d'intérêt
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const centreId = searchParams.get('id')

    if (!centreId) {
      return NextResponse.json(
        { error: 'L\'ID du centre d\'intérêt est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      'DELETE FROM centres_interets WHERE centre_id = $1 RETURNING *',
      [centreId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Centre d\'intérêt non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Centre d\'intérêt supprimé avec succès'
    })
  } catch (error) {
    console.error('Erreur lors de la suppression du centre d\'intérêt:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
