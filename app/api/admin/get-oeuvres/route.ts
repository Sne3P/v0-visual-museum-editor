import { NextRequest, NextResponse } from 'next/server'
import { getPostgresClient } from '@/lib/database-postgres'

export async function GET() {
  const client = await getPostgresClient()

  try {
    // Récupérer SEULEMENT les œuvres qui ont un entity (sont sur le plan)
    // Les oeuvres orphelines ne sont pas affichées
    const result = await client.query(`
      SELECT 
        o.*,
        COUNT(DISTINCT p.pregeneration_id) as pregeneration_count,
        COUNT(DISTINCT c.chunk_id) as chunk_count
      FROM oeuvres o
      INNER JOIN entities e ON o.oeuvre_id = e.oeuvre_id
      LEFT JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
      LEFT JOIN chunk c ON o.oeuvre_id = c.oeuvre_id
      WHERE e.entity_type = 'ARTWORK'
      GROUP BY o.oeuvre_id
      ORDER BY o.created_at DESC
    `)

    return NextResponse.json({
      success: true,
      oeuvres: result.rows
    })
  } catch (error) {
    console.error('Erreur get-oeuvres:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
