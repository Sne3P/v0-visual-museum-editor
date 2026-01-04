import { NextRequest, NextResponse } from 'next/server'
import { getPostgresClient } from '@/lib/database-postgres'

export async function POST(request: NextRequest) {
  const client = await getPostgresClient()

  try {
    const body = await request.json()
    
    // Support both formats: direct exportData or wrapped { exportData }
    const exportData = body.exportData || body

    if (!exportData?.plan_editor?.plans) {
      console.error('Invalid format:', JSON.stringify(body).substring(0, 200))
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
    }

    await client.query('BEGIN')

    try {
      // Clear existing data
      await client.query('TRUNCATE TABLE points, relations, entities, plans, oeuvres, chunk CASCADE')

      // Insert plans
      for (const plan of exportData.plan_editor.plans) {
        await client.query(
          'INSERT INTO plans (plan_id, nom, description, date_creation) VALUES ($1, $2, $3, $4)',
          [plan.plan_id, plan.nom, plan.description || '', plan.date_creation]
        )
      }

      // Insert oeuvres (from oeuvres_contenus)
      if (exportData.oeuvres_contenus?.oeuvres) {
        for (const oeuvre of exportData.oeuvres_contenus.oeuvres) {
          await client.query(
            `INSERT INTO oeuvres (oeuvre_id, title, artist, description, image_link, pdf_link, file_path, room) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              oeuvre.oeuvre_id,
              oeuvre.title,
              oeuvre.artist,
              oeuvre.description || '',
              oeuvre.image_link || null,
              oeuvre.pdf_path || oeuvre.pdf_link || null,
              oeuvre.pdf_path || null,
              oeuvre.room
            ]
          )
        }
      }

      // Insert entities
      if (exportData.plan_editor.entities) {
        for (const entity of exportData.plan_editor.entities) {
          await client.query(
            `INSERT INTO entities (entity_id, plan_id, name, entity_type, description, oeuvre_id) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              entity.entity_id,
              entity.plan_id,
              entity.name,
              entity.entity_type,
              entity.description || '',
              entity.oeuvre_id || null
            ]
          )
        }
      }

      // Insert points
      if (exportData.plan_editor.points) {
        for (const point of exportData.plan_editor.points) {
          await client.query(
            'INSERT INTO points (point_id, entity_id, x, y, ordre) VALUES ($1, $2, $3, $4, $5)',
            [point.point_id, point.entity_id, point.x, point.y, point.ordre]
          )
        }
      }

      // Insert relations
      if (exportData.plan_editor.relations) {
        for (const relation of exportData.plan_editor.relations) {
          await client.query(
            'INSERT INTO relations (relation_id, source_id, cible_id, type_relation) VALUES ($1, $2, $3, $4)',
            [relation.relation_id, relation.source_id, relation.cible_id, relation.type_relation]
          )
        }
      }

      // Insert chunks
      if (exportData.oeuvres_contenus?.chunks) {
        for (const chunk of exportData.oeuvres_contenus.chunks) {
          await client.query(
            'INSERT INTO chunk (chunk_id, chunk_text, oeuvre_id) VALUES ($1, $2, $3)',
            [chunk.chunk_id, chunk.chunk_text, chunk.oeuvre_id]
          )
        }
      }

      await client.query('COMMIT')
      
      return NextResponse.json({ 
        success: true,
        inserted: {
          plans: exportData.plan_editor.plans.length,
          entities: exportData.plan_editor.entities?.length || 0,
          points: exportData.plan_editor.points?.length || 0,
          oeuvres: exportData.oeuvres_contenus?.oeuvres?.length || 0
        }
      })

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

  } catch (error: any) {
    console.error('Save error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}
