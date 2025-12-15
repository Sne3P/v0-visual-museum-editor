import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, runQuery } from '@/lib/database-sqlite'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

interface ExportData {
  plan_editor: {
    plans: Array<{
      plan_id: number
      nom: string
      description: string
      date_creation: string
    }>
    entities: Array<{
      entity_id: number
      plan_id: number
      name: string
      entity_type: string
      description: string
      oeuvre_id: number | null
    }>
    points: Array<{
      point_id: number
      entity_id: number
      x: number
      y: number
      ordre: number
    }>
    relations: Array<{
      relation_id: number
      source_id: number
      cible_id: number
      type_relation: string
    }>
  }
  oeuvres_contenus: {
    oeuvres: Array<{
      oeuvre_id: number
      title: string
      artist: string
      description: string
      image_link: string | null
      pdf_link: string | null
      room: number
    }>
    chunks: Array<{
      chunk_id: number
      chunk_text: string
      oeuvre_id: number
    }>
  }
  temp_pdfs?: Array<{
    filename: string
    base64: string
  }>
  criterias_guides: {
    criterias: Array<{
      criteria_id: number
      type: string
      name: string
      description: string
      image_link: string
    }>
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Réception demande de sauvegarde')
    const body = await request.json()
    const { exportData }: { exportData: ExportData } = body

    if (!exportData) {
      console.log('❌ Données d\'export manquantes')
      return NextResponse.json({ error: 'Données d\'export manquantes' }, { status: 400 })
    }

    // Log du JSON complet pour debug
    console.log('🔍 JSON exportData complet:', JSON.stringify(exportData, null, 2))

    console.log('📊 Données reçues:', {
      plans: exportData.plan_editor?.plans?.length || 0,
      entities: exportData.plan_editor?.entities?.length || 0,
      points: exportData.plan_editor?.points?.length || 0,
      oeuvres: exportData.oeuvres_contenus?.oeuvres?.length || 0
    })

    // Traiter les PDF temporaires s'ils existent
    let processedPdfs = 0
    if (exportData.temp_pdfs && exportData.temp_pdfs.length > 0) {
      try {
        // Assurer que le dossier de destination existe
        const uploadsDir = join(process.cwd(), 'public', 'uploads', 'pdfs')
        await mkdir(uploadsDir, { recursive: true })

        // Sauvegarder chaque PDF temporaire
        for (const tempPdf of exportData.temp_pdfs) {
          const buffer = Buffer.from(tempPdf.base64, 'base64')
          const filePath = join(uploadsDir, tempPdf.filename)
          await writeFile(filePath, buffer)
          processedPdfs++
          console.log(`💾 PDF sauvegardé: ${tempPdf.filename}`)
        }
      } catch (error) {
        console.error('Erreur lors de la sauvegarde des PDF:', error)
        return NextResponse.json({ 
          error: 'Erreur lors de la sauvegarde des PDF temporaires',
          details: error instanceof Error ? error.message : 'Erreur inconnue'
        }, { status: 500 })
      }
    }

    const db = await getDatabase()

    // Exécuter dans une transaction SQLite
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION')

        try {
          // Vider les tables dans le bon ordre (contraintes de clé étrangère)
          // Pour SQLite, on utilise DELETE au lieu de TRUNCATE
          const tablesToClear = [
            'criterias_pregeneration',
            'criterias_guide', 
            'oeuvre_criterias',
            'chunk',
            'pregenerations',
            'relations',
            'points', 
            'entities',
            'plans',
            'oeuvres',
            'criterias'
          ]

          for (const table of tablesToClear) {
            db.run(`DELETE FROM ${table}`)
          }

          // Insérer les plans
          const insertPlan = db.prepare('INSERT INTO plans (nom, description, date_creation) VALUES (?, ?, ?)')
          for (const plan of exportData.plan_editor.plans) {
            insertPlan.run(plan.nom, plan.description, plan.date_creation)
          }
          insertPlan.finalize()

          // Insérer les œuvres
          const insertOeuvre = db.prepare('INSERT INTO oeuvres (title, artist, description, image_link, pdf_link, room) VALUES (?, ?, ?, ?, ?, ?)')
          for (const oeuvre of exportData.oeuvres_contenus.oeuvres) {
            insertOeuvre.run(oeuvre.title, oeuvre.artist, oeuvre.description, oeuvre.image_link, oeuvre.pdf_link, oeuvre.room)
          }
          insertOeuvre.finalize()

          // Insérer les critères
          const insertCriteria = db.prepare('INSERT INTO criterias (type, name, description, image_link) VALUES (?, ?, ?, ?)')
          for (const criteria of exportData.criterias_guides.criterias) {
            insertCriteria.run(criteria.type, criteria.name, criteria.description, criteria.image_link)
          }
          insertCriteria.finalize()

          // Insérer les entités
          const insertEntity = db.prepare('INSERT INTO entities (plan_id, name, entity_type, description, oeuvre_id) VALUES (?, ?, ?, ?, ?)')
          for (const entity of exportData.plan_editor.entities) {
            insertEntity.run(entity.plan_id, entity.name, entity.entity_type, entity.description, entity.oeuvre_id)
          }
          insertEntity.finalize()

          // Insérer les points
          const insertPoint = db.prepare('INSERT INTO points (entity_id, x, y, ordre) VALUES (?, ?, ?, ?)')
          for (const point of exportData.plan_editor.points) {
            insertPoint.run(point.entity_id, point.x, point.y, point.ordre)
          }
          insertPoint.finalize()

          // Insérer les relations
          const insertRelation = db.prepare('INSERT INTO relations (source_id, cible_id, type_relation) VALUES (?, ?, ?)')
          for (const relation of exportData.plan_editor.relations) {
            insertRelation.run(relation.source_id, relation.cible_id, relation.type_relation)
          }
          insertRelation.finalize()

          // Insérer les chunks
          const insertChunk = db.prepare('INSERT INTO chunk (chunk_text, oeuvre_id) VALUES (?, ?)')
          for (const chunk of exportData.oeuvres_contenus.chunks) {
            insertChunk.run(chunk.chunk_text, chunk.oeuvre_id)
          }
          insertChunk.finalize()

          db.run('COMMIT', (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })

        } catch (error) {
          db.run('ROLLBACK')
          reject(error)
        }
      })
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Données sauvegardées avec succès dans SQLite',
      inserted: {
        plans: exportData.plan_editor.plans.length,
        entities: exportData.plan_editor.entities.length,
        points: exportData.plan_editor.points.length,
        relations: exportData.plan_editor.relations.length,
        oeuvres: exportData.oeuvres_contenus.oeuvres.length,
        chunks: exportData.oeuvres_contenus.chunks.length,
        criterias: exportData.criterias_guides.criterias.length,
        pdfs: processedPdfs
      }
    })

  } catch (error) {
    console.error('Erreur lors de la sauvegarde SQLite:', error)
    return NextResponse.json({ 
      error: 'Erreur lors de la sauvegarde dans SQLite',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}