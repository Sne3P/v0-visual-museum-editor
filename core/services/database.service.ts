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
  file_name?: string | null
  file_path?: string | null
  room: number
  // Métadonnées extraites du PDF
  metadata?: {
    title?: string
    artist?: string
    description?: string
    date_oeuvre?: string
    materiaux?: string
    mouvement?: string
    provenance?: string
    contexte?: string
    analyse?: string
    iconographie?: string
    reception?: string
    parcours?: string
    lieu_naissance?: string
    anecdotes?: string[]
  }
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
    // Chunks removed - created by backend during PDF extraction
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
  // chunkIdCounter removed - chunks created by backend

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
  // chunks removed - created by backend during PDF processing
  const relations: any[] = []
  const tempPdfs: Array<{ filename: string; base64: string }> = []
  
  // Map roomId (UUID) -> entity_id for artwork association
  const roomIdToEntityId: Map<string, number> = new Map()
  
  // Compteurs globaux pour noms lisibles
  let roomCounter = 1
  let doorCounter = 1
  let wallCounter = 1
  let stairsCounter = 1
  let elevatorCounter = 1

  state.floors.forEach((floor, floorIndex) => {
    const planId = floorIndex + 1

    // ROOMS
    floor.rooms.forEach((room) => {
      const entityId = entityIdCounter++
      
      // Store mapping roomId -> entity_id
      roomIdToEntityId.set(room.id, entityId)
      
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Salle ${roomCounter}`,  // Nom simple: Salle 1, Salle 2, etc.
        entity_type: 'ROOM',
        description: JSON.stringify({ 
          id: room.id,
          holes: room.holes || [],
          room_number: roomCounter  // Garder le numéro dans la description
        }),
        oeuvre_id: null
      })
      
      roomCounter++  // Incrémenter pour la prochaine salle

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
      let fileName: string | null = null
      
      // Gérer PDF temporaires
      if ((artwork as any).tempPdfFile && (artwork as any).tempPdfBase64) {
        fileName = `artwork_${artwork.id}_${Date.now()}.pdf`
        tempPdfs.push({
          filename: fileName,
          base64: (artwork as any).tempPdfBase64
        })
        finalPdfPath = `/uploads/pdfs/${fileName}`
      } else if (finalPdfPath) {
        // Extraire le nom du fichier du chemin
        fileName = finalPdfPath.split('/').pop() || null
      }

      // Trouver l'entity_id de la room à partir du roomId
      const roomEntityId = artwork.roomId ? roomIdToEntityId.get(artwork.roomId) : null

      oeuvres.push({
        oeuvre_id: oeuvreId,
        title: artwork.name || artwork.metadata?.title || 'Sans titre',
        artist: artwork.artist || artwork.metadata?.artist || 'Artiste inconnu',
        description: artwork.metadata?.description || '',
        image_link: null,
        pdf_path: finalPdfPath,
        pdf_link: finalPdfPath,  // Legacy compatibility
        file_name: fileName || null,
        file_path: finalPdfPath,
        room: roomEntityId || null,  // Utiliser l'entity_id de la room ou null si pas de room
        // Inclure toutes les métadonnées extraites du PDF
        metadata: artwork.metadata ? {
          title: artwork.metadata.title,
          artist: artwork.metadata.artist,
          description: artwork.metadata.description,
          date_oeuvre: artwork.metadata.date_oeuvre,
          materiaux: artwork.metadata.materiaux,
          mouvement: artwork.metadata.mouvement,
          provenance: artwork.metadata.provenance,
          contexte: artwork.metadata.contexte,
          analyse: artwork.metadata.analyse,
          iconographie: artwork.metadata.iconographie,
          reception: artwork.metadata.reception,
          parcours: artwork.metadata.parcours,
          lieu_naissance: artwork.metadata.lieu_naissance,
          anecdotes: artwork.metadata.anecdotes
        } : undefined
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

      // Points (rectangle complet de l'artwork: 4 coins)
      const artworkWidth = artwork.size?.[0] || 40
      const artworkHeight = artwork.size?.[1] || 40
      const artworkX = artwork.xy[0]
      const artworkY = artwork.xy[1]
      
      // Coin haut-gauche
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: artworkX,
        y: artworkY,
        ordre: 1
      })
      
      // Coin haut-droit
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: artworkX + artworkWidth,
        y: artworkY,
        ordre: 2
      })
      
      // Coin bas-droit
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: artworkX + artworkWidth,
        y: artworkY + artworkHeight,
        ordre: 3
      })
      
      // Coin bas-gauche
      points.push({
        point_id: pointIdCounter++,
        entity_id: entityId,
        x: artworkX,
        y: artworkY + artworkHeight,
        ordre: 4
      })

      // NOTE: Les chunks RAG sont créés par le backend lors de l'upload du PDF
      // via /api/extract-pdf-metadata qui traite le PDF et crée chunks + embeddings
      // Ne PAS créer de chunks vides ici - cela pollue la base de données
    })

    // DOORS
    floor.doors.forEach((door) => {
      const entityId = entityIdCounter++
      
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Porte ${doorCounter}`,  // Nom lisible: Porte 1, Porte 2, etc.
        entity_type: 'DOOR',
        description: JSON.stringify({
          id: door.id,
          width: door.width,
          room_a: door.room_a,
          room_b: door.room_b,
          roomId: door.roomId,
          door_number: doorCounter
        }),
        oeuvre_id: null
      })
      
      doorCounter++  // Incrémenter pour la prochaine porte

      door.segment.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
      
      // CRÉER UNE RELATION ENTRE LES SALLES VIA LA PORTE
      // NOTE: Une seule relation suffit (pas besoin de bidirectionnelle)
      // Le backend/pathfinding gère les deux sens automatiquement
      const roomAEntityId = door.room_a ? roomIdToEntityId.get(door.room_a) : null
      const roomBEntityId = door.room_b ? roomIdToEntityId.get(door.room_b) : null
      
      if (roomAEntityId && roomBEntityId) {
        // Une seule relation: toujours du plus petit ID vers le plus grand pour éviter doublons
        const [sourceId, cibleId] = roomAEntityId < roomBEntityId 
          ? [roomAEntityId, roomBEntityId]
          : [roomBEntityId, roomAEntityId]
        
        relations.push({
          relation_id: relationIdCounter++,
          source_id: sourceId,
          cible_id: cibleId,
          type_relation: 'DOOR'
        })
      }
    })

    // VERTICAL LINKS
    floor.verticalLinks.forEach((link) => {
      const entityId = entityIdCounter++
      
      const isStairs = link.type === 'stairs'
      const counter = isStairs ? stairsCounter++ : elevatorCounter++
      const name = isStairs ? `Escalier ${counter}` : `Ascenseur ${counter}`
      
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: name,  // Nom lisible: Escalier 1, Ascenseur 1, etc.
        entity_type: 'VERTICAL_LINK',
        description: JSON.stringify({
          id: link.id,
          type: link.type,
          floorId: link.floorId,
          size: link.size,
          connectedFloorIds: link.connectedFloorIds,
          roomId: link.roomId,
          linkGroupId: link.linkGroupId,
          linkNumber: link.linkNumber,
          number: counter
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
        name: `Mur ${wallCounter}`,  // Nom lisible: Mur 1, Mur 2, etc.
        entity_type: 'WALL',
        description: JSON.stringify({
          id: wall.id,
          thickness: wall.thickness,
          isLoadBearing: wall.isLoadBearing,
          roomId: wall.roomId,
          path: wall.path,
          wall_number: wallCounter
        }),
        oeuvre_id: null
      })
      
      wallCounter++  // Incrémenter pour le prochain mur

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
      oeuvres
      // Chunks created by backend during PDF extraction
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
