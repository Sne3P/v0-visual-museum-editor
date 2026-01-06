import { NextRequest, NextResponse } from 'next/server'
import { getPostgresPool } from '@/lib/database-postgres'

/**
 * GET /api/themes
 * Récupère tous les thèmes ou un thème spécifique
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const themeId = searchParams.get('id')

    const pool = await getPostgresPool()

    if (themeId) {
      const result = await pool.query(
        'SELECT * FROM themes WHERE theme_id = $1',
        [themeId]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Thème non trouvé' },
          { status: 404 }
        )
      }

      return NextResponse.json(result.rows[0])
    } else {
      const result = await pool.query(
        'SELECT * FROM themes ORDER BY created_at ASC'
      )
      return NextResponse.json(result.rows)
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des thèmes:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/themes
 * Crée un nouveau thème
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
      `INSERT INTO themes (name, description, ai_indication, image) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name, description || null, ai_indication || null, image || null]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    }, { status: 201 })
  } catch (error: any) {
    console.error('Erreur lors de la création du thème:', error)
    
    if (error.code === '23505') { // Duplicate key
      return NextResponse.json(
        { error: 'Un thème avec ce nom existe déjà' },
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
 * PUT /api/themes
 * Met à jour un thème
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { theme_id, name, description, ai_indication, image } = body

    if (!theme_id) {
      return NextResponse.json(
        { error: 'L\'ID du thème est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      `UPDATE themes 
       SET name = $1, description = $2, ai_indication = $3, image = $4, updated_at = CURRENT_TIMESTAMP
       WHERE theme_id = $5
       RETURNING *`,
      [name, description || null, ai_indication || null, image || null, theme_id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Thème non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du thème:', error)
    
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Un thème avec ce nom existe déjà' },
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
 * DELETE /api/themes
 * Supprime un thème
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const themeId = searchParams.get('id')

    if (!themeId) {
      return NextResponse.json(
        { error: 'L\'ID du thème est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      'DELETE FROM themes WHERE theme_id = $1 RETURNING *',
      [themeId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Thème non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Thème supprimé avec succès'
    })
  } catch (error) {
    console.error('Erreur lors de la suppression du thème:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
