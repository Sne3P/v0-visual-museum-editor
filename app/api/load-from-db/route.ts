import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database-sqlite'

export async function GET() {
  try {
    console.log('📤 Demande de chargement des données')
    const db = await getDatabase()

    // Récupérer toutes les données depuis SQLite
    const plans = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM plans ORDER BY plan_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    const entities = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM entities ORDER BY entity_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    const points = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM points ORDER BY point_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    const oeuvres = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM oeuvres ORDER BY oeuvre_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    const relations = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM relations ORDER BY relation_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    const chunks = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM chunk ORDER BY chunk_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    const criterias = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM criterias ORDER BY criteria_id', (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    console.log('📊 Données chargées depuis SQLite:', {
      plans: plans.length,
      entities: entities.length,
      points: points.length,
      oeuvres: oeuvres.length,
      relations: relations.length,
      chunks: chunks.length,
      criterias: criterias.length
    })

    // Convertir les données SQLite vers le format EditorState
    const floors = plans.map(plan => {
      // Récupérer les entités pour ce plan
      const planEntities = entities.filter(entity => entity.plan_id === plan.plan_id)
      
      // Séparer les rooms et walls
      const rooms = planEntities
        .filter(entity => entity.entity_type === 'ROOM')
        .map(entity => {
          const entityPoints = points
            .filter(point => point.entity_id === entity.entity_id)
            .sort((a, b) => a.ordre - b.ordre)
            .map(point => ({ x: point.x, y: point.y }))

            return {
            id: `room-${entity.entity_id}`,
            polygon: entityPoints
          }
        })

      const walls = planEntities
        .filter(entity => entity.entity_type === 'WALL')
        .map(entity => {
          const entityPoints = points
            .filter(point => point.entity_id === entity.entity_id)
            .sort((a, b) => a.ordre - b.ordre)
            .map(point => ({ x: point.x, y: point.y }))

          return {
            id: `wall-${entity.entity_id}`,
            start: entityPoints[0] || { x: 0, y: 0 },
            end: entityPoints[1] || { x: 100, y: 100 }
          }
        })

      // Créer les artworks séparément depuis la table oeuvres
      const floorArtworks = oeuvres
        .filter(oeuvre => {
          // Trouver si cette œuvre est associée à une entité de ce plan
          return entities.some(entity => 
            entity.oeuvre_id === oeuvre.oeuvre_id && 
            entity.plan_id === plan.plan_id
          )
        })
        .map(oeuvre => ({
          id: `artwork-${oeuvre.oeuvre_id}`,
          xy: [400, 300] as const, // Position par défaut
          size: [60, 40] as const, // Taille par défaut
          name: oeuvre.title,
          pdf_id: oeuvre.pdf_link || undefined,
          pdfLink: oeuvre.pdf_link || undefined
        }))

      return {
        id: `F${plan.plan_id}`,
        name: plan.nom,
        rooms,
        doors: [],
        walls,
        artworks: floorArtworks,
        verticalLinks: [],
        escalators: [],
        elevators: []
      }
    })

    console.log('🏗️ Floors construits:', floors)

    const editorState = {
      floors: floors.length > 0 ? floors : [{
        id: 'F1',
        name: 'Ground Floor',
        rooms: [],
        doors: [],
        walls: [],
        artworks: [],
        verticalLinks: [],
        escalators: [],
        elevators: []
      }],
      currentFloorId: floors.length > 0 ? `F${plans[0]?.plan_id || 1}` : 'F1',
      selectedTool: 'select' as const,
      selectedElementId: null,
      selectedElementType: null,
      selectedElements: [],
      gridSize: 1.0,
      zoom: 1,
      pan: { x: 0, y: 0 },
      isPanning: false,
      currentPolygon: [],
      history: [],
      historyIndex: -1,
      contextMenu: null,
      measurements: {
        showMeasurements: true,
        showDynamicMeasurements: true,
        measurements: []
      }
    }

    console.log('📋 EditorState final:', {
      floorsCount: editorState.floors.length,
      currentFloorId: editorState.currentFloorId,
      firstFloor: editorState.floors[0]
    })

    return NextResponse.json({ 
      success: true, 
      data: editorState,
      loaded: {
        plans: plans.length,
        entities: entities.length,
        points: points.length,
        oeuvres: oeuvres.length,
        relations: relations.length,
        chunks: chunks.length,
        criterias: criterias.length
      }
    })

  } catch (error) {
    console.error('Erreur lors du chargement depuis SQLite:', error)
    return NextResponse.json({ 
      error: 'Erreur lors du chargement depuis SQLite',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}