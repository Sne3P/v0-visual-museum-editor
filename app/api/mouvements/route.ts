import { NextRequest, NextResponse } from 'next/server'
import { getPostgresPool } from '@/lib/database-postgres'

/**
 * GET /api/mouvements
 * Récupère tous les mouvements artistiques ou un mouvement spécifique
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mouvementId = searchParams.get('id')

    const pool = await getPostgresPool()

    if (mouvementId) {
      const result = await pool.query(
        'SELECT * FROM mouvements_artistiques WHERE mouvement_id = $1',
        [mouvementId]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Mouvement artistique non trouvé' },
          { status: 404 }
        )
      }

      return NextResponse.json(result.rows[0])
    } else {
      const result = await pool.query(
        'SELECT * FROM mouvements_artistiques ORDER BY created_at ASC'
      )
      return NextResponse.json(result.rows)
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des mouvements artistiques:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/mouvements
 * Crée un nouveau mouvement artistique
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
      `INSERT INTO mouvements_artistiques (name, description, ai_indication, image) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name, description || null, ai_indication || null, image || null]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    }, { status: 201 })
  } catch (error: any) {
    console.error('Erreur lors de la création du mouvement artistique:', error)
    
    if (error.code === '23505') { // Duplicate key
      return NextResponse.json(
        { error: 'Un mouvement artistique avec ce nom existe déjà' },
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
 * PUT /api/mouvements
 * Met à jour un mouvement artistique
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mouvement_id, name, description, ai_indication, image } = body

    if (!mouvement_id) {
      return NextResponse.json(
        { error: 'L\'ID du mouvement artistique est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      `UPDATE mouvements_artistiques 
       SET name = $1, description = $2, ai_indication = $3, image = $4, updated_at = CURRENT_TIMESTAMP
       WHERE mouvement_id = $5
       RETURNING *`,
      [name, description || null, ai_indication || null, image || null, mouvement_id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Mouvement artistique non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du mouvement artistique:', error)
    
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Un mouvement artistique avec ce nom existe déjà' },
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
 * DELETE /api/mouvements
 * Supprime un mouvement artistique
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mouvementId = searchParams.get('id')

    if (!mouvementId) {
      return NextResponse.json(
        { error: 'L\'ID du mouvement artistique est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      'DELETE FROM mouvements_artistiques WHERE mouvement_id = $1 RETURNING *',
      [mouvementId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Mouvement artistique non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Mouvement artistique supprimé avec succès'
    })
  } catch (error) {
    console.error('Erreur lors de la suppression du mouvement artistique:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
