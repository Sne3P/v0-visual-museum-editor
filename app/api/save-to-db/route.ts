import { NextRequest, NextResponse } from 'next/server'
import { getPostgresClient } from '@/lib/database-postgres'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Nettoie les PDFs orphelins (fichiers uploadés mais non enregistrés)
 */
async function cleanupOrphanPdfs(savedOeuvres: any[]) {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'pdfs')
    
    // Lire tous les fichiers PDF
    const files = await fs.readdir(uploadsDir).catch(() => [])
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'))
    
    if (pdfFiles.length === 0) return

    // Extraire les noms de fichiers des œuvres sauvegardées
    const savedPdfNames = new Set(
      savedOeuvres
        .filter(o => o.pdf_path)
        .map(o => o.pdf_path.split('/').pop())
    )

    // Identifier et supprimer les orphelins
    let deletedCount = 0
    for (const filename of pdfFiles) {
      if (!savedPdfNames.has(filename)) {
        try {
          await fs.unlink(path.join(uploadsDir, filename))
          console.log(`🗑️  PDF orphelin supprimé: ${filename}`)
          deletedCount++
        } catch (error) {
          console.warn(`⚠️  Impossible de supprimer ${filename}:`, error)
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ ${deletedCount} PDF(s) orphelin(s) nettoyé(s)`)
    }
  } catch (error) {
    console.error('Erreur cleanupOrphanPdfs:', error)
  }
}

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
      // Clear existing plan data (entities, points, relations) but KEEP oeuvres and pregenerations
      // First, remove oeuvre_id from entities to break FK cascade
      await client.query('UPDATE entities SET oeuvre_id = NULL WHERE oeuvre_id IS NOT NULL')
      
      // Delete orphaned oeuvres (created but never saved to plan)
      // BUT keep oeuvres with pregenerations (expensive LLM content)
      const orphansResult = await client.query(`
        DELETE FROM oeuvres
        WHERE oeuvre_id NOT IN (
          SELECT DISTINCT oeuvre_id FROM entities WHERE oeuvre_id IS NOT NULL
        )
        AND oeuvre_id NOT IN (
          SELECT DISTINCT oeuvre_id FROM pregenerations WHERE oeuvre_id IS NOT NULL
        )
        RETURNING oeuvre_id, title
      `)
      
      if (orphansResult.rows.length > 0) {
        console.log(`🗑️  Suppression ${orphansResult.rows.length} oeuvre(s) orpheline(s):`,
          orphansResult.rows.map((r: any) => r.title).join(', '))
      }
      
      // Now truncate plan geometry safely
      // NOTE: Chunks NOT truncated here - managed by force_regenerate during narration generation
      await client.query('TRUNCATE TABLE points, relations, entities, plans CASCADE')

      // Insert plans
      for (const plan of exportData.plan_editor.plans) {
        await client.query(
          'INSERT INTO plans (plan_id, nom, description, date_creation) VALUES ($1, $2, $3, $4)',
          [plan.plan_id, plan.nom, plan.description || '', plan.date_creation]
        )
      }

      // UPSERT oeuvres (update if exists, insert if new) - PRESERVE pregenerations
      if (exportData.oeuvres_contenus?.oeuvres) {
        for (const oeuvre of exportData.oeuvres_contenus.oeuvres) {
          // Les métadonnées peuvent être dans oeuvre.metadata OU directement dans oeuvre (après chargement)
          const meta = oeuvre.metadata || {}
          console.log(`📝 Sauvegarde œuvre: ${oeuvre.title}, artist: ${oeuvre.artist}, metadata:`, meta)
          
          await client.query(
            `INSERT INTO oeuvres (
              oeuvre_id, title, artist, description, image_link, pdf_link, file_name, file_path, room,
              date_oeuvre, materiaux_technique, provenance, contexte_commande,
              analyse_materielle_technique, iconographie_symbolique, 
              reception_circulation_posterite, parcours_conservation_doc
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (oeuvre_id) DO UPDATE SET
              title = EXCLUDED.title,
              artist = EXCLUDED.artist,
              description = EXCLUDED.description,
              image_link = EXCLUDED.image_link,
              pdf_link = EXCLUDED.pdf_link,
              file_name = EXCLUDED.file_name,
              file_path = EXCLUDED.file_path,
              room = EXCLUDED.room,
              date_oeuvre = EXCLUDED.date_oeuvre,
              materiaux_technique = EXCLUDED.materiaux_technique,
              provenance = EXCLUDED.provenance,
              contexte_commande = EXCLUDED.contexte_commande,
              analyse_materielle_technique = EXCLUDED.analyse_materielle_technique,
              iconographie_symbolique = EXCLUDED.iconographie_symbolique,
              reception_circulation_posterite = EXCLUDED.reception_circulation_posterite,
              parcours_conservation_doc = EXCLUDED.parcours_conservation_doc,
              updated_at = CURRENT_TIMESTAMP`,
            [
              oeuvre.oeuvre_id,
              oeuvre.title || meta.title || '',
              oeuvre.artist || meta.artist || '',
              oeuvre.description || meta.description || '',
              oeuvre.image_link || null,
              oeuvre.pdf_path || oeuvre.pdf_link || null,
              oeuvre.pdf_path ? oeuvre.pdf_path.split('/').pop() : null,
              oeuvre.pdf_path || null,
              oeuvre.room,
              meta.date_oeuvre || null,
              meta.materiaux || meta.materiaux_technique || null,
              meta.provenance || null,
              meta.contexte || meta.contexte_commande || null,
              meta.analyse || meta.analyse_materielle_technique || null,
              meta.iconographie || meta.iconographie_symbolique || null,
              meta.reception || meta.reception_circulation_posterite || null,
              meta.parcours || meta.parcours_conservation_doc || null
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

      // Insert relations (with deduplication for DOOR relations)
      if (exportData.plan_editor.relations) {
        // Dédupliquer les relations DOOR bidirectionnelles
        const seenDoorPairs = new Set<string>()
        
        for (const relation of exportData.plan_editor.relations) {
          // Pour les portes, dédupliquer les paires bidirectionnelles
          if (relation.type_relation === 'DOOR') {
            const pair = [relation.source_id, relation.cible_id].sort().join('-')
            if (seenDoorPairs.has(pair)) {
              console.log(`⏭️  Doublon DOOR ignoré: ${relation.source_id} ↔ ${relation.cible_id}`)
              continue  // Skip doublon
            }
            seenDoorPairs.add(pair)
          }
          
          await client.query(
            'INSERT INTO relations (relation_id, source_id, cible_id, type_relation) VALUES ($1, $2, $3, $4)',
            [relation.relation_id, relation.source_id, relation.cible_id, relation.type_relation]
          )
        }
      }

      // Chunks are created by backend during PDF extraction (extract-pdf-metadata)
      // NOT saved from frontend to avoid polluting database with empty chunks
      // The RAG pipeline handles: PDF → chunks → embeddings → FAISS index

      await client.query('COMMIT')
      
      // Nettoyage des PDFs orphelins en arrière-plan (ne bloque pas la réponse)
      cleanupOrphanPdfs(exportData.oeuvres_contenus?.oeuvres || []).catch(err => {
        console.error('❌ Erreur nettoyage PDFs orphelins:', err)
      })
      
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
