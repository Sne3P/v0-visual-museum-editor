import { NextRequest, NextResponse } from 'next/server'
import { getPostgresClient } from '@/lib/database-postgres'

export async function GET() {
  const client = await getPostgresClient()

  try {
    // Stats globales
    const statsResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM oeuvres) as total_oeuvres,
        (SELECT COUNT(*) FROM pregenerations) as total_pregenerations,
        (SELECT COUNT(DISTINCT oeuvre_id) FROM pregenerations) as oeuvres_with_pregenerations,
        -- Calculer le nombre de combinaisons attendues dynamiquement
        (
          SELECT COALESCE(
            (
              SELECT COUNT(*) 
              FROM (
                SELECT DISTINCT jsonb_object_keys(criteria_combination) 
                FROM pregenerations 
                LIMIT 1
              ) types
            ) * (
              SELECT COUNT(*) FROM criterias
            ) / NULLIF((SELECT COUNT(DISTINCT type) FROM criterias), 0),
            0
          )
        ) as expected_per_oeuvre
    `)

    const stats = statsResult.rows[0]
    const expectedTotal = stats.total_oeuvres * stats.expected_per_oeuvre
    const completionRate = expectedTotal > 0 
      ? (stats.total_pregenerations / expectedTotal) * 100 
      : 0

    return NextResponse.json({
      success: true,
      stats: {
        total_oeuvres: parseInt(stats.total_oeuvres),
        total_pregenerations: parseInt(stats.total_pregenerations),
        oeuvres_with_pregenerations: parseInt(stats.oeuvres_with_pregenerations),
        expected_pregenerations: expectedTotal,
        completion_rate: completionRate
      }
    })
  } catch (error) {
    console.error('Erreur get-stats:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
