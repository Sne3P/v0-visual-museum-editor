/**
 * SERVICE DATABASE
 * Gestion sauvegarde/chargement base de données
 */

import type { EditorState } from '@/core/entities'
import type { Floor } from '@/core/entities'

interface ExportEntity {
  entity_id: number
  plan_id: number
  name: string
  entity_type: string
  description: string
  oeuvre_id: number | null
}

interface ExportPoint {
  point_id: number
  entity_id: number
  x: number
  y: number
  ordre: number
}

interface ExportOeuvre {
  oeuvre_id: number
  title: string
  artist: string
  description: string
  image_link: string | null
  pdf_link: string | null  // Legacy
  pdf_path?: string | null  // Nouveau
  room: number
}

interface ExportData {
  plan_editor: {
    plans: Array<{
      plan_id: number
      nom: string
      description: string
      date_creation: string
    }>
    entities: ExportEntity[]
    points: ExportPoint[]
    relations: Array<{
      relation_id: number
      source_id: number
      cible_id: number
      type_relation: string
    }>
  }
  oeuvres_contenus: {
    oeuvres: ExportOeuvre[]
    chunks: Array<{
      chunk_id: number
      chunk_text: string
      oeuvre_id: number
    }>
  }
  temp_pdfs: Array<{
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

/**
 * Convertit l'état éditeur vers format BDD
 */
export function convertStateToExportData(state: EditorState): ExportData {
  let entityIdCounter = 1
  let pointIdCounter = 1
  let relationIdCounter = 1
  let oeuvreIdCounter = 1
  let chunkIdCounter = 1

  // Plans (1 par floor)
  const plans = state.floors.map((floor, index) => ({
    plan_id: index + 1,
    nom: floor.name || `Plan ${index + 1}`,
    description: `Plan de niveau ${floor.name}`,
    date_creation: new Date().toISOString().split('T')[0]
  }))

  const entities: ExportEntity[] = []
  const points: ExportPoint[] = []
  const oeuvres: ExportOeuvre[] = []
  const chunks: any[] = []
  const relations: any[] = []
  const tempPdfs: Array<{ filename: string; base64: string }> = []

  state.floors.forEach((floor, floorIndex) => {
    const planId = floorIndex + 1

    // ROOMS
    floor.rooms.forEach((room) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Salle ${room.id}`,
        entity_type: 'ROOM',
        description: JSON.stringify({ 
          id: room.id,
          holes: room.holes || []
        }),
        oeuvre_id: null
      })

      room.polygon.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
    })

    // ARTWORKS
    floor.artworks.forEach((artwork) => {
      const oeuvreId = oeuvreIdCounter++
      
      let finalPdfPath = artwork.pdfPath || artwork.pdfLink || null
      
      // Gérer PDF temporaires
      if ((artwork as any).tempPdfFile && (artwork as any).tempPdfBase64) {
        const fileName = `artwork_${artwork.id}_${Date.now()}.pdf`
        tempPdfs.push({
          filename: fileName,
          base64: (artwork as any).tempPdfBase64
        })
        finalPdfPath = `/uploads/pdfs/${fileName}`
      }

      oeuvres.push({
        oeuvre_id: oeuvreId,
        title: artwork.name || 'Sans titre',
        artist: 'Artiste inconnu',
        description: '',
        image_link: null,
        pdf_path: finalPdfPath,
        pdf_link: finalPdfPath,  // Legacy compatibility
        room: artwork.roomId ? parseInt(artwork.roomId.split('-')[1] || '1') : 1
      })

      // Entity ARTWORK (pour la position + taille)
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: artwork.name || 'Sans titre',
        entity_type: 'ARTWORK',
        description: JSON.stringify({
          id: artwork.id,
          size: artwork.size || [40, 40],
          roomId: artwork.roomId,
          pdfPath: finalPdfPath
        }),
        oeuvre_id: oeuvreId
      })

      // Points (position xy)
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: artwork.xy[0],
        y: artwork.xy[1],
        ordre: 1
      })

      // Chunks (texte associé)
      if (artwork.name) {
        chunks.push({
          chunk_id: chunkIdCounter++,
          chunk_text: artwork.name,
          oeuvre_id: oeuvreId
        })
      }
    })

    // DOORS
    floor.doors.forEach((door) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Porte ${door.id}`,
        entity_type: 'DOOR',
        description: JSON.stringify({
          id: door.id,
          width: door.width,
          room_a: door.room_a,
          room_b: door.room_b,
          roomId: door.roomId
        }),
        oeuvre_id: null
      })

      door.segment.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
    })

    // VERTICAL LINKS
    floor.verticalLinks.forEach((link) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `${link.type === 'stairs' ? 'Escalier' : 'Ascenseur'} ${link.id}`,
        entity_type: 'VERTICAL_LINK',
        description: JSON.stringify({
          id: link.id,
          type: link.type,
          floorId: link.floorId,
          size: link.size,
          connectedFloorIds: link.connectedFloorIds,
          roomId: link.roomId,
          linkGroupId: link.linkGroupId,
          linkNumber: link.linkNumber
        }),
        oeuvre_id: null
      })

      // Position
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: link.position.x,
        y: link.position.y,
        ordre: 1
      })
    })

    // WALLS
    floor.walls.forEach((wall) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Mur ${wall.id}`,
        entity_type: 'WALL',
        description: JSON.stringify({
          id: wall.id,
          thickness: wall.thickness,
          isLoadBearing: wall.isLoadBearing,
          roomId: wall.roomId,
          path: wall.path
        }),
        oeuvre_id: null
      })

      // Si multi-points, sauvegarder path, sinon segment
      const wallPoints = wall.path || wall.segment
      wallPoints.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
    })

    // ESCALATORS
    floor.escalators?.forEach((escalator) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Escalator ${escalator.id}`,
        entity_type: 'ESCALATOR',
        description: JSON.stringify({
          id: escalator.id,
          fromFloorId: escalator.fromFloorId,
          toFloorId: escalator.toFloorId,
          direction: escalator.direction,
          width: escalator.width
        }),
        oeuvre_id: null
      })

      // Start et end position
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: escalator.startPosition.x,
        y: escalator.startPosition.y,
        ordre: 1
      })
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: escalator.endPosition.x,
        y: escalator.endPosition.y,
        ordre: 2
      })
    })

    // ELEVATORS
    floor.elevators?.forEach((elevator) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Elevator ${elevator.id}`,
        entity_type: 'ELEVATOR',
        description: JSON.stringify({
          id: elevator.id,
          size: elevator.size,
          connectedFloorIds: elevator.connectedFloorIds
        }),
        oeuvre_id: null
      })

      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: elevator.position.x,
        y: elevator.position.y,
        ordre: 1
      })
    })
  })

  return {
    plan_editor: {
      plans,
      entities,
      points,
      relations
    },
    oeuvres_contenus: {
      oeuvres,
      chunks
    },
    temp_pdfs: tempPdfs,
    criterias_guides: {
      criterias: []
    }
  }
}

/**
 * Sauvegarde l'état dans la BDD
 */
export async function saveToDatabase(state: EditorState): Promise<{
  success: boolean
  error?: string
  inserted?: any
}> {
  try {
    const exportData = convertStateToExportData(state)
    
    const response = await fetch('/api/save-to-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportData })
    })

    const result = await response.json()
    return result
  } catch (error) {
    console.error('❌ Erreur sauvegarde BDD:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    }
  }
}

/**
 * Charge l'état depuis la BDD
 */
export async function loadFromDatabase(): Promise<{
  success: boolean
  state?: EditorState
  error?: string
}> {
  try {
    const response = await fetch('/api/load-from-db')
    const result = await response.json()
    
    if (result.success && result.editorState) {
      return {
        success: true,
        state: result.editorState
      }
    }
    
    return {
      success: false,
      error: result.error || 'Erreur chargement'
    }
  } catch (error) {
    console.error('❌ Erreur chargement BDD:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    }
  }
}
