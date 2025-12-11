import { NextRequest, NextResponse } from 'next/server'
import { executeTransaction } from '@/lib/database'

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
  criterias_guides: {
    criterias: Array<{
      criterias_id: number
      type: string
      name: string
      description: string
      image_link: string
    }>
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { exportData }: { exportData: ExportData } = body

    if (!exportData) {
      return NextResponse.json({ error: 'Données d\'export manquantes' }, { status: 400 })
    }

    // Préparer toutes les requêtes d'insertion
    const queries: Array<{ text: string, params?: any[] }> = []

    // Vider les tables dans le bon ordre (contraintes de clé étrangère)
    queries.push({ text: 'TRUNCATE TABLE criterias_pregeneration, criterias_guide, oeuvre_criterias, chunk, pregeneration, relations, points, entities, plans, oeuvres, criterias RESTART IDENTITY CASCADE' })

    // Insérer les plans
    for (const plan of exportData.plan_editor.plans) {
      queries.push({
        text: 'INSERT INTO plans (nom, description, date_creation) VALUES ($1, $2, $3)',
        params: [plan.nom, plan.description, plan.date_creation]
      })
    }

    // Insérer les œuvres
    for (const oeuvre of exportData.oeuvres_contenus.oeuvres) {
      queries.push({
        text: 'INSERT INTO oeuvres (title, artist, description, image_link, pdf_link, room) VALUES ($1, $2, $3, $4, $5, $6)',
        params: [oeuvre.title, oeuvre.artist, oeuvre.description, oeuvre.image_link, oeuvre.pdf_link, oeuvre.room]
      })
    }

    // Insérer les critères
    for (const criteria of exportData.criterias_guides.criterias) {
      queries.push({
        text: 'INSERT INTO criterias (type, name, description, image_link) VALUES ($1, $2, $3, $4)',
        params: [criteria.type, criteria.name, criteria.description, criteria.image_link]
      })
    }

    // Insérer les entités
    for (const entity of exportData.plan_editor.entities) {
      queries.push({
        text: 'INSERT INTO entities (plan_id, name, entity_type, description, oeuvre_id) VALUES ($1, $2, $3, $4, $5)',
        params: [entity.plan_id, entity.name, entity.entity_type, entity.description, entity.oeuvre_id]
      })
    }

    // Insérer les points
    for (const point of exportData.plan_editor.points) {
      queries.push({
        text: 'INSERT INTO points (entity_id, x, y, ordre) VALUES ($1, $2, $3, $4)',
        params: [point.entity_id, point.x, point.y, point.ordre]
      })
    }

    // Insérer les relations
    for (const relation of exportData.plan_editor.relations) {
      queries.push({
        text: 'INSERT INTO relations (source_id, cible_id, type_relation) VALUES ($1, $2, $3)',
        params: [relation.source_id, relation.cible_id, relation.type_relation]
      })
    }

    // Insérer les chunks
    for (const chunk of exportData.oeuvres_contenus.chunks) {
      queries.push({
        text: 'INSERT INTO chunk (chunk_text, oeuvre_id) VALUES ($1, $2)',
        params: [chunk.chunk_text, chunk.oeuvre_id]
      })
    }

    // Exécuter toutes les requêtes dans une transaction
    await executeTransaction(queries)

    return NextResponse.json({ 
      success: true, 
      message: 'Données sauvegardées avec succès dans PostgreSQL',
      inserted: {
        plans: exportData.plan_editor.plans.length,
        entities: exportData.plan_editor.entities.length,
        points: exportData.plan_editor.points.length,
        relations: exportData.plan_editor.relations.length,
        oeuvres: exportData.oeuvres_contenus.oeuvres.length,
        chunks: exportData.oeuvres_contenus.chunks.length,
        criterias: exportData.criterias_guides.criterias.length
      }
    })

  } catch (error) {
    console.error('Erreur lors de la sauvegarde PostgreSQL:', error)
    return NextResponse.json({ 
      error: 'Erreur lors de la sauvegarde dans PostgreSQL',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}