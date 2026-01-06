import { NextRequest, NextResponse } from 'next/server'
import { getPostgresPool } from '@/lib/database-postgres'

/**
 * GET /api/museum-settings
 * Récupère tous les paramètres du musée ou un paramètre spécifique
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const settingKey = searchParams.get('setting_key')

    const pool = await getPostgresPool()

    if (settingKey) {
      // Récupérer un paramètre spécifique
      const result = await pool.query(
        'SELECT setting_id, setting_key, setting_value, description, category, updated_at FROM museum_settings WHERE setting_key = $1',
        [settingKey]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Paramètre non trouvé' },
          { status: 404 }
        )
      }

      return NextResponse.json(result.rows[0])
    } else {
      // Récupérer tous les paramètres
      const result = await pool.query(
        'SELECT setting_id, setting_key, setting_value, description, category, updated_at FROM museum_settings ORDER BY category, setting_key'
      )

      return NextResponse.json(result.rows)
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des paramètres:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la récupération des paramètres' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/museum-settings
 * Met à jour un paramètre du musée
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { setting_key, setting_value } = body

    if (!setting_key) {
      return NextResponse.json(
        { error: 'Le paramètre setting_key est requis' },
        { status: 400 }
      )
    }

    if (setting_value === undefined) {
      return NextResponse.json(
        { error: 'Le paramètre setting_value est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    // Vérifier si le paramètre existe
    const checkResult = await pool.query(
      'SELECT setting_id FROM museum_settings WHERE setting_key = $1',
      [setting_key]
    )

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Paramètre non trouvé' },
        { status: 404 }
      )
    }

    // Convertir la valeur en JSON si ce n'est pas déjà le cas
    let jsonValue = setting_value
    if (typeof setting_value === 'string') {
      try {
        // Vérifier si c'est déjà du JSON valide
        JSON.parse(setting_value)
        jsonValue = setting_value
      } catch {
        // Si ce n'est pas du JSON, on l'encode
        jsonValue = JSON.stringify(setting_value)
      }
    } else {
      jsonValue = JSON.stringify(setting_value)
    }

    // Mettre à jour le paramètre
    const result = await pool.query(
      `UPDATE museum_settings 
       SET setting_value = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
       WHERE setting_key = $2 
       RETURNING setting_id, setting_key, setting_value, description, category, updated_at`,
      [jsonValue, setting_key]
    )

    return NextResponse.json({
      success: true,
      setting: result.rows[0]
    })
  } catch (error) {
    console.error('Erreur lors de la mise à jour du paramètre:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la mise à jour du paramètre' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/museum-settings
 * Crée un nouveau paramètre du musée
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { setting_key, setting_value, description, category } = body

    if (!setting_key || setting_value === undefined) {
      return NextResponse.json(
        { error: 'Les paramètres setting_key et setting_value sont requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    // Convertir la valeur en JSON
    const jsonValue = typeof setting_value === 'string' 
      ? setting_value 
      : JSON.stringify(setting_value)

    // Insérer le nouveau paramètre
    const result = await pool.query(
      `INSERT INTO museum_settings (setting_key, setting_value, description, category) 
       VALUES ($1, $2::jsonb, $3, $4) 
       RETURNING setting_id, setting_key, setting_value, description, category, updated_at`,
      [setting_key, jsonValue, description || null, category || 'general']
    )

    return NextResponse.json({
      success: true,
      setting: result.rows[0]
    }, { status: 201 })
  } catch (error: any) {
    console.error('Erreur lors de la création du paramètre:', error)
    
    // Gérer le cas de clé dupliquée
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ce paramètre existe déjà' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du paramètre' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/museum-settings
 * Supprime un paramètre du musée
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const settingKey = searchParams.get('setting_key')

    if (!settingKey) {
      return NextResponse.json(
        { error: 'Le paramètre setting_key est requis' },
        { status: 400 }
      )
    }

    const pool = await getPostgresPool()

    const result = await pool.query(
      'DELETE FROM museum_settings WHERE setting_key = $1 RETURNING setting_id',
      [settingKey]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Paramètre non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Paramètre supprimé avec succès'
    })
  } catch (error) {
    console.error('Erreur lors de la suppression du paramètre:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la suppression du paramètre' },
      { status: 500 }
    )
  }
}
