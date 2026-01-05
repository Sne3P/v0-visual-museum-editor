import { NextRequest, NextResponse } from 'next/server'
import { queryPostgres } from '@/lib/database-postgres'

export async function GET() {
  try {
    const plans = await queryPostgres<any>('SELECT * FROM plans ORDER BY plan_id')
    const entities = await queryPostgres<any>('SELECT * FROM entities ORDER BY entity_id')
    const points = await queryPostgres<any>('SELECT * FROM points ORDER BY entity_id, ordre')
    const oeuvres = await queryPostgres<any>('SELECT * FROM oeuvres')
    const relations = await queryPostgres<any>('SELECT * FROM relations')

    if (plans.length === 0) {
      // Default floor structure
      return NextResponse.json({
        success: true,
        editorState: {
          floors: [{
            id: 'floor-1',
            name: 'F1',
            description: '',
            rooms: [],
            walls: [],
            artworks: [],
            doors: [],
            verticalLinks: []
          }],
          currentFloorId: 'floor-1',
          selectedTool: 'select',
          gridSize: 40,
          zoom: 1,
          pan: { x: 0, y: 0 },
          history: [],
          historyIndex: -1,
          contextMenu: null,
          selectedElements: [],
          measurements: { active: false, points: [] }
        }
      })
    }

    // Helper: Safe JSON parse
    const parseMetadata = (description: string | null): any => {
      if (!description) return {}
      try {
        return JSON.parse(description)
      } catch {
        return {}
      }
    }

    // Reconstruct floors from database
    const floors = plans.map((plan: any, index: number) => {
      const planEntities = entities.filter((e: any) => e.plan_id === plan.plan_id)

      // ROOMS
      const rooms = planEntities
        .filter((e: any) => e.entity_type === 'ROOM')
        .map((entity: any) => {
          const polygon = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
            .map((p: any) => ({ x: p.x, y: p.y }))
          
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `room-${entity.entity_id}`,
            polygon,
            holes: metadata.holes || []
          }
        })

      // WALLS
      const walls = planEntities
        .filter((e: any) => e.entity_type === 'WALL')
        .map((entity: any) => {
          const wallPoints = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
            .map((p: any) => ({ x: p.x, y: p.y }))
          
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `wall-${entity.entity_id}`,
            segment: wallPoints.slice(0, 2),
            path: metadata.path,
            thickness: metadata.thickness || 0.15,
            isLoadBearing: metadata.isLoadBearing || false,
            roomId: metadata.roomId
          }
        })

      // ARTWORKS
      const artworks = planEntities
        .filter((e: any) => e.entity_type === 'ARTWORK')
        .map((entity: any) => {
          const artworkPoints = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
          
          const oeuvre = oeuvres.find((o: any) => o.oeuvre_id === entity.oeuvre_id)
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `artwork-${entity.entity_id}`,
            xy: artworkPoints.length > 0 ? [artworkPoints[0].x, artworkPoints[0].y] : [0, 0],
            size: metadata.size || [40, 40],
            name: oeuvre?.title || entity.name || 'Sans titre',
            artist: oeuvre?.artist || 'Artiste inconnu',
            pdfPath: oeuvre?.file_path || oeuvre?.pdf_link || metadata.pdfPath || null,
            roomId: metadata.roomId,
            metadata: oeuvre ? {
              title: oeuvre.title,
              artist: oeuvre.artist,
              description: oeuvre.description,
              date_oeuvre: oeuvre.date_oeuvre,
              materiaux: oeuvre.materiaux_technique,
              provenance: oeuvre.provenance,
              contexte: oeuvre.contexte_commande,
              analyse: oeuvre.analyse_materielle_technique,
              iconographie: oeuvre.iconographie_symbolique,
              reception: oeuvre.reception_circulation_posterite,
              parcours: oeuvre.parcours_conservation_doc
            } : undefined
          }
        })

      // DOORS
      const doors = planEntities
        .filter((e: any) => e.entity_type === 'DOOR')
        .map((entity: any) => {
          const doorPoints = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
            .map((p: any) => ({ x: p.x, y: p.y }))
          
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `door-${entity.entity_id}`,
            segment: doorPoints.slice(0, 2),
            width: metadata.width || 0.8,
            room_a: metadata.room_a || '',
            room_b: metadata.room_b || '',
            roomId: metadata.roomId
          }
        })

      // VERTICAL LINKS
      const verticalLinks = planEntities
        .filter((e: any) => e.entity_type === 'VERTICAL_LINK')
        .map((entity: any) => {
          const linkPoints = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
          
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `vlink-${entity.entity_id}`,
            type: metadata.type || 'stairs',
            floorId: metadata.floorId || `floor-${plan.plan_id}`,
            position: linkPoints.length > 0 ? { x: linkPoints[0].x, y: linkPoints[0].y } : { x: 0, y: 0 },
            size: metadata.size || [80, 120],
            connectedFloorIds: metadata.connectedFloorIds || [],
            roomId: metadata.roomId,
            linkGroupId: metadata.linkGroupId,
            linkNumber: metadata.linkNumber
          }
        })

      // ESCALATORS
      const escalators = planEntities
        .filter((e: any) => e.entity_type === 'ESCALATOR')
        .map((entity: any) => {
          const escalatorPoints = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
          
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `escalator-${entity.entity_id}`,
            startPosition: escalatorPoints.length > 0 ? { x: escalatorPoints[0].x, y: escalatorPoints[0].y } : { x: 0, y: 0 },
            endPosition: escalatorPoints.length > 1 ? { x: escalatorPoints[1].x, y: escalatorPoints[1].y } : { x: 0, y: 0 },
            fromFloorId: metadata.fromFloorId || '',
            toFloorId: metadata.toFloorId || '',
            direction: metadata.direction || 'up',
            width: metadata.width || 1.0
          }
        })

      // ELEVATORS
      const elevators = planEntities
        .filter((e: any) => e.entity_type === 'ELEVATOR')
        .map((entity: any) => {
          const elevatorPoints = points
            .filter((p: any) => p.entity_id === entity.entity_id)
            .sort((a: any, b: any) => a.ordre - b.ordre)
          
          const metadata = parseMetadata(entity.description)
          
          return {
            id: metadata.id || `elevator-${entity.entity_id}`,
            position: elevatorPoints.length > 0 ? { x: elevatorPoints[0].x, y: elevatorPoints[0].y } : { x: 0, y: 0 },
            size: metadata.size || 1.5,
            connectedFloorIds: metadata.connectedFloorIds || []
          }
        })

      return {
        id: `floor-${plan.plan_id}`,
        name: plan.nom,
        description: plan.description || '',
        rooms,
        walls,
        artworks,
        doors,
        verticalLinks,
        escalators: escalators || [],
        elevators: elevators || []
      }
    })

    const editorState = {
      floors,
      currentFloorId: floors[0]?.id || 'floor-1',
      selectedTool: 'select',
      gridSize: 40,
      zoom: 1,
      pan: { x: 0, y: 0 },
      history: [],
      historyIndex: -1,
      contextMenu: null,
      selectedElements: [],
      measurements: { active: false, points: [] }
    }

    return NextResponse.json({
      success: true,
      editorState
    })

  } catch (error: any) {
    console.error('Load error:', error)
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 })
  }
}
