"use client"

import { useState, useCallback, useEffect } from "react"
import { Canvas } from "./canvas"
import { Toolbar } from "./toolbar"
import { FloorTabs } from "./floor-tabs"
import { PropertiesPanel } from "./properties-panel"
import { ArtworkPdfDialog } from "./artwork-pdf-dialog"
import type { EditorState, Tool, Floor, MeasurementDisplay, Artwork } from "@/lib/types"
import { calculatePolygonAreaInMeters, getPolygonCenter } from "@/lib/geometry"
import { v4 as uuidv4 } from "uuid"

export function MuseumEditor() {
  const [state, setState] = useState<EditorState>({
    floors: [
      {
        id: "F1",
        name: "Ground Floor",
        rooms: [],
        doors: [],
        walls: [],
        artworks: [],
        verticalLinks: [],
        escalators: [],
        elevators: [],
      },
    ],
    currentFloorId: "F1",
    selectedTool: "select",
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
      measurements: [],
    },
  })

  const [pdfDialogArtwork, setPdfDialogArtwork] = useState<Artwork | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [isLoading, setIsLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const currentFloor = state.floors.find((f) => f.id === state.currentFloorId)!

  // Fonction pour charger les données depuis SQLite
  const loadFromDatabase = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/load-from-db')
      const result = await response.json()
      
      if (result.success && result.data) {
        console.log('📥 Données reçues de l\'API:', result.data)
        console.log('🏢 Floors dans les données:', result.data.floors?.length || 0)
        if (result.data.floors && result.data.floors.length > 0) {
          console.log('🏠 Premier floor:', result.data.floors[0])
        }
        setState(result.data)
        console.log('✅ Plan chargé depuis SQLite:', result.loaded)
      } else {
        console.log('ℹ️ Aucune donnée trouvée, utilisation du plan par défaut')
        console.log('❌ Résultat de l\'API:', result)
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fonction pour sauvegarder (automatique ou manuelle)
  const autoSave = useCallback(async (currentState: EditorState, isManual = false) => {
    try {
      if (isManual) setSaveStatus('saving')
      
      console.log('💾 Début sauvegarde:', { 
        isManual, 
        floors: currentState.floors.length,
        currentFloor: currentState.currentFloorId 
      })
      
      // Convertir l'état vers le format d'export
      const exportData = convertStateToExportFormat(currentState)
      
      const response = await fetch('/api/save-to-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportData })
      })

      const result = await response.json()
      if (result.success) {
        setLastSaved(new Date())
        if (isManual) {
          setSaveStatus('success')
          setTimeout(() => setSaveStatus('idle'), 2000) // Reset après 2 secondes
        }
        console.log('✅ Sauvegarde réussie:', result.inserted)
      } else {
        throw new Error(result.error || 'Erreur de sauvegarde')
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error)
      if (isManual) {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000) // Reset après 3 secondes
      }
    }
  }, [])

  // Fonction de sauvegarde manuelle
  const handleManualSave = useCallback(async () => {
    console.log('💾 Sauvegarde manuelle déclenchée')
    await autoSave(state, true)
  }, [state, autoSave])

  // Charger au démarrage
  useEffect(() => {
    loadFromDatabase()
  }, [loadFromDatabase])

  // Auto-sauvegarde désactivée temporairement pour debug
  // useEffect(() => {
  //   if (!isLoading && state.floors.length > 0) {
  //     const timeoutId = setTimeout(() => {
  //       autoSave(state)
  //     }, 5000) // Sauvegarde après 5 secondes d'inactivité

  //     return () => clearTimeout(timeoutId)
  //   }
  // }, [state, isLoading, autoSave])

  // Fonction pour convertir l'état en format d'export
  const convertStateToExportFormat = useCallback((currentState: EditorState) => {
    console.log('🔄 Conversion de l\'état pour export:', {
      floors: currentState.floors.length,
      currentFloorId: currentState.currentFloorId
    })
    
    let entityIdCounter = 1
    let pointIdCounter = 1
    let relationIdCounter = 1
    let oeuvreIdCounter = 1
    let chunkIdCounter = 1

    // 1. Plans
    const plans = currentState.floors.map((floor, index) => ({
      plan_id: index + 1,
      nom: floor.name || `Plan ${index + 1}`,
      description: `Plan de niveau ${floor.name}`,
      date_creation: new Date().toISOString().split('T')[0]
    }))

    console.log('📊 Plans générés:', plans)

    // 2. Entities + Points
    const entities: any[] = []
    const points: any[] = []
    const oeuvres: any[] = []
    const chunks: any[] = []
    const relations: any[] = []

    currentState.floors.forEach((floor, floorIndex) => {
      const planId = floorIndex + 1
      console.log(`🏢 Floor ${floorIndex} (${floor.name}):`, {
        rooms: floor.rooms?.length || 0,
        walls: floor.walls?.length || 0,
        artworks: floor.artworks?.length || 0
      })

      // Entités ROOM (salles)
      floor.rooms.forEach((room) => {
        const entityId = entityIdCounter++
        
        entities.push({
          entity_id: entityId,
          plan_id: planId,
          name: `Salle ${entityId}`,
          entity_type: 'ROOM',
          description: `Salle du musée`,
          oeuvre_id: null
        })

        // Points de la room (polygon)
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

      // Artworks séparées
      floor.artworks.forEach((artwork) => {
        const oeuvreId = oeuvreIdCounter++
        
        // Gérer les PDF temporaires
        let finalPdfLink = artwork.pdfLink || null
        if (artwork.tempPdfFile && artwork.tempPdfBase64) {
          // Si un PDF temporaire existe, générer un nom de fichier et l'utiliser
          const fileName = `artwork_${artwork.id}_${Date.now()}.pdf`
          finalPdfLink = `/uploads/pdfs/${fileName}`
        }
        
        oeuvres.push({
          oeuvre_id: oeuvreId,
          title: artwork.name || 'Sans titre',
          artist: 'Artiste inconnu',
          description: '',
          image_link: null,
          pdf_link: finalPdfLink,
          room: 1 // ID de salle par défaut
        })

        // Ajouter chunks si nécessaire
        if (artwork.name) {
          chunks.push({
            chunk_id: chunkIdCounter++,
            chunk_text: artwork.name,
            oeuvre_id: oeuvreId
          })
        }
      })

      // Entités DOOR (portes)
      floor.doors.forEach((door) => {
        const entityId = entityIdCounter++
        entities.push({
          entity_id: entityId,
          plan_id: planId,
          name: `Porte ${door.id}`,
          entity_type: 'DOOR',
          description: `Porte entre ${door.room_a} et ${door.room_b}`,
          oeuvre_id: null
        })

        // Points de la porte
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

      // Entités VERTICAL_LINK (escaliers)
      floor.verticalLinks.forEach((link) => {
        const entityId = entityIdCounter++
        entities.push({
          entity_id: entityId,
          plan_id: planId,
          name: `${link.type === 'stairs' ? 'Escalier' : 'Ascenseur'} ${link.id}`,
          entity_type: 'VERTICAL_LINK',
          description: `Liaison verticale vers étage ${link.to_floor}`,
          oeuvre_id: null
        })

        // Points du lien vertical
        link.segment.forEach((point, index) => {
          points.push({
            point_id: pointIdCounter++,
            entity_id: entityId,
            x: point.x,
            y: point.y,
            ordre: index + 1
          })
        })
      })

      // Entités WALL (murs)
      floor.walls.forEach((wall) => {
        const entityId = entityIdCounter++
        entities.push({
          entity_id: entityId,
          plan_id: planId,
          name: `Mur ${entityId}`,
          entity_type: 'WALL',
          description: 'Mur du musée',
          oeuvre_id: null
        })

        // Points du mur
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: wall.start.x,
          y: wall.start.y,
          ordre: 1
        })
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: wall.end.x,
          y: wall.end.y,
          ordre: 2
        })
      })
    })

    // Collecte des PDF temporaires à sauvegarder
    const tempPdfs: Array<{ filename: string; base64: string }> = []
    currentState.floors.forEach(floor => {
      floor.artworks.forEach(artwork => {
        if (artwork.tempPdfFile && artwork.tempPdfBase64) {
          const fileName = `artwork_${artwork.id}_${Date.now()}.pdf`
          tempPdfs.push({
            filename: fileName,
            base64: artwork.tempPdfBase64
          })
        }
      })
    })

    const result = {
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

    console.log('📤 Résultat final de la conversion:', {
      plans: result.plan_editor.plans.length,
      entities: result.plan_editor.entities.length,
      points: result.plan_editor.points.length,
      oeuvres: result.oeuvres_contenus.oeuvres.length
    })

    return result
  }, [])

  // Système d'historique amélioré
  const saveToHistory = useCallback((newState: EditorState, actionDescription?: string) => {
    setState((prev) => {
      // Ne pas sauvegarder si c'est identique au dernier état
      if (prev.history.length > 0) {
        const lastState = prev.history[prev.historyIndex]
        if (JSON.stringify(lastState.floors) === JSON.stringify(newState.floors)) {
          return { ...prev, ...newState }
        }
      }

      const newHistory = prev.history.slice(0, prev.historyIndex + 1)
      const stateToSave = {
        ...newState,
        actionDescription: actionDescription || 'Action'
      }
      newHistory.push(stateToSave)
      
      // Limiter l'historique à 50 actions pour éviter les problèmes de mémoire
      if (newHistory.length > 50) {
        newHistory.shift()
      }
      
      return {
        ...newState,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    })
  }, [])

  // Mise à jour temporaire sans historique (pour les drags en cours)
  const updateStateTemporary = useCallback((updates: Partial<EditorState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  // Fonction pour régénérer les mesures des surfaces des pièces
  const regenerateMeasurements = useCallback((floors: ReadonlyArray<Floor>) => {
    const measurements: MeasurementDisplay[] = []
    
    floors.forEach(floor => {
      floor.rooms.forEach(room => {
        const area = calculatePolygonAreaInMeters(room.polygon)
        const center = getPolygonCenter(room.polygon)
        
        measurements.push({
          id: `area-${room.id}`,
          type: "area",
          position: center,
          value: area,
          unit: "m²",
          elementId: room.id,
        })
      })
    })
    
    return measurements
  }, [])

  // Fonction updateState améliorée qui régénère automatiquement les mesures
  const updateStateWithMeasurements = useCallback((updates: Partial<EditorState>, saveHistory = false, actionDescription?: string) => {
    const newState = { ...state, ...updates }
    
    // Régénérer les mesures si les floors ont changé
    if (updates.floors) {
      const newMeasurements = regenerateMeasurements(updates.floors)
      newState.measurements = {
        ...state.measurements,
        measurements: newMeasurements,
      }
    }
    
    if (saveHistory && updates.floors) {
      saveToHistory(newState, actionDescription)
    } else {
      setState(prev => ({ ...prev, ...newState }))
    }
  }, [state, saveToHistory, regenerateMeasurements])

  // Ancienne fonction pour compatibilité - maintenant ne sauvegarde QUE si explicitement demandé
  const updateState = useCallback((updates: Partial<EditorState>, saveHistory = false, actionDescription?: string) => {
    if (saveHistory && updates.floors) {
      const newState = { ...state, ...updates }
      saveToHistory(newState, actionDescription)
    } else {
      setState((prev) => ({ ...prev, ...updates }))
    }
  }, [state, saveToHistory])

  const addFloor = useCallback((direction: 1 | -1 = 1) => {
    // Trouver le prochain numéro d'étage
    let newFloorNum: number
    let newFloorName: string
    
    if (direction === 1) {
      // Étage au-dessus : trouver le plus haut étage + 1
      const maxFloorNum = state.floors
        .map(f => {
          const match = f.id.match(/^F(-?\d+)$/)
          return match ? parseInt(match[1]) : 0
        })
        .reduce((max, num) => Math.max(max, num), 0)
      
      newFloorNum = maxFloorNum + 1
      newFloorName = newFloorNum === 1 ? "Ground Floor" : `Floor ${newFloorNum}`
    } else {
      // Sous-sol : trouver le plus bas sous-sol - 1
      const minFloorNum = state.floors
        .map(f => {
          const match = f.id.match(/^F(-?\d+)$/)
          return match ? parseInt(match[1]) : 0
        })
        .reduce((min, num) => Math.min(min, num), 0)
      
      newFloorNum = Math.min(minFloorNum - 1, -1)
      newFloorName = `Basement ${Math.abs(newFloorNum)}`
    }
    
    const newFloor: Floor = {
      id: `F${newFloorNum}`,
      name: newFloorName,
      rooms: [],
      doors: [],
      walls: [],
      artworks: [],
      verticalLinks: [],
      escalators: [],
      elevators: [],
    }
    
    // Insérer le nouvel étage à la bonne position
    const newFloors = [...state.floors, newFloor].sort((a, b) => {
      const aNum = parseInt(a.id.replace('F', ''))
      const bNum = parseInt(b.id.replace('F', ''))
      return bNum - aNum // Trier par ordre décroissant (étages les plus hauts en premier)
    })
    
    updateStateWithMeasurements({
      floors: newFloors,
      currentFloorId: newFloor.id,
    })
  }, [state.floors, updateStateWithMeasurements])

  const deleteFloor = useCallback((floorId: string) => {
    // Vérifier qu'on ne supprime pas le dernier étage
    if (state.floors.length <= 1) {
      alert("Impossible de supprimer le dernier étage. Il doit y avoir au moins un étage dans le bâtiment.")
      return
    }

    const floorToDelete = state.floors.find(f => f.id === floorId)
    if (!floorToDelete) return

    // Vérifier si l'étage contient des éléments
    const hasElements = 
      floorToDelete.rooms.length > 0 ||
      floorToDelete.doors.length > 0 ||
      floorToDelete.walls.length > 0 ||
      floorToDelete.artworks.length > 0 ||
      floorToDelete.verticalLinks.length > 0 ||
      floorToDelete.escalators.length > 0 ||
      floorToDelete.elevators.length > 0

    // Message de confirmation personnalisé selon le contenu
    let confirmMessage = `Êtes-vous sûr de vouloir supprimer l'étage "${floorToDelete.name}" ?`
    if (hasElements) {
      const elementCount = 
        floorToDelete.rooms.length +
        floorToDelete.doors.length +
        floorToDelete.walls.length +
        floorToDelete.artworks.length +
        floorToDelete.verticalLinks.length +
        floorToDelete.escalators.length +
        floorToDelete.elevators.length
      
      confirmMessage += `\n\nCet étage contient ${elementCount} élément${elementCount > 1 ? 's' : ''} (pièces, portes, œuvres, etc.) qui seront définitivement supprimés.`
    }
    confirmMessage += "\n\nCette action est irréversible."

    // Demander confirmation
    if (!window.confirm(confirmMessage)) {
      return
    }

    // Supprimer l'étage
    const newFloors = state.floors.filter(f => f.id !== floorId)
    
    // Si on supprime l'étage actuel, passer au premier étage disponible
    let newCurrentFloorId = state.currentFloorId
    if (state.currentFloorId === floorId) {
      newCurrentFloorId = newFloors[0]?.id || ''
    }

    updateStateWithMeasurements({
      floors: newFloors,
      currentFloorId: newCurrentFloorId,
      selectedElementId: null,
      selectedElementType: null,
      selectedElements: [],
    }, true, `Supprimer étage "${floorToDelete.name}"`)
  }, [state.floors, state.currentFloorId, updateStateWithMeasurements])

  const switchFloor = useCallback(
    (floorId: string) => {
      updateState({ currentFloorId: floorId })
    },
    [updateState],
  )

  const selectTool = useCallback(
    (tool: Tool) => {
      updateState({
        selectedTool: tool,
        currentPolygon: [],
        selectedElementId: null,
        selectedElementType: null,
      })
    },
    [updateState],
  )

  // Fonction pour gérer l'ouverture du dialogue PDF
  const handleArtworkDoubleClick = useCallback((artworkId: string) => {
    const artwork = currentFloor.artworks.find(a => a.id === artworkId)
    if (artwork) {
      setPdfDialogArtwork(artwork)
    }
  }, [currentFloor.artworks])

  // Fonction pour sauvegarder le PDF d'une œuvre
  const handleSavePdfToArtwork = useCallback(async (artworkId: string, pdfFile: File | null, pdfUrl: string, title?: string, base64?: string) => {
    const newFloors = state.floors.map(floor => {
      if (floor.id !== state.currentFloorId) return floor
      
      return {
        ...floor,
        artworks: floor.artworks.map(artwork => {
          if (artwork.id !== artworkId) return artwork
          
          return {
            ...artwork,
            pdfLink: pdfUrl,
            name: title || artwork.name,
            tempPdfFile: pdfFile,
            tempPdfBase64: base64
          }
        })
      }
    })

    updateStateWithMeasurements({ floors: newFloors }, true, `Assigner PDF et titre à l'œuvre ${artworkId}`)

    if (pdfFile) {
      console.log(`PDF "${pdfFile.name}" et titre "${title}" assignés temporairement à l'œuvre ${artworkId}`)
    }
  }, [state.floors, state.currentFloorId, updateStateWithMeasurements])

  const recenterView = useCallback(() => {
    if (currentFloor.rooms.length === 0) {
      updateState({ pan: { x: 400, y: 300 }, zoom: 1 })
      return
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    currentFloor.rooms.forEach((room) => {
      room.polygon.forEach((point) => {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      })
    })

    const GRID_SIZE = 40
    const centerX = ((minX + maxX) / 2) * GRID_SIZE
    const centerY = ((minY + maxY) / 2) * GRID_SIZE

    const canvas = document.querySelector("canvas")
    if (!canvas) return

    const newPan = {
      x: canvas.width / 2 - centerX * state.zoom,
      y: canvas.height / 2 - centerY * state.zoom,
    }

    updateState({ pan: newPan })
  }, [currentFloor, state.zoom, updateState])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault()
          if (state.historyIndex > 0) {
            setState((prev) => ({
              ...prev.history[prev.historyIndex - 1],
              historyIndex: prev.historyIndex - 1,
            }))
          }
        } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault()
          if (state.historyIndex < state.history.length - 1) {
            setState((prev) => ({
              ...prev.history[prev.historyIndex + 1],
              historyIndex: prev.historyIndex + 1,
            }))
          }
        }
      }

      if (e.key === "Delete" && (state.selectedElementId || state.selectedElements.length > 0)) {
        e.preventDefault()
        const newFloors = state.floors.map((floor) => {
          if (floor.id !== state.currentFloorId) return floor

          let updatedFloor = { ...floor }

          // Gérer la sélection simple (ancien système)
          if (state.selectedElementId) {
            if (state.selectedElementType === "room") {
              updatedFloor.rooms = floor.rooms.filter((r) => r.id !== state.selectedElementId)
            } else if (state.selectedElementType === "artwork") {
              updatedFloor.artworks = floor.artworks.filter((a) => a.id !== state.selectedElementId)
            } else if (state.selectedElementType === "door") {
              updatedFloor.doors = floor.doors.filter((d) => d.id !== state.selectedElementId)
            } else if (state.selectedElementType === "verticalLink") {
              updatedFloor.verticalLinks = floor.verticalLinks.filter((v) => v.id !== state.selectedElementId)
            } else if (state.selectedElementType === "wall") {
              updatedFloor.walls = floor.walls.filter((w) => w.id !== state.selectedElementId)
            }
          }

          // Gérer les sélections multiples (nouveau système)
          if (state.selectedElements.length > 0) {
            const elementsToDelete = state.selectedElements.filter(el => el.type !== "vertex")
            
            elementsToDelete.forEach(element => {
              if (element.type === "room") {
                updatedFloor.rooms = updatedFloor.rooms.filter((r) => r.id !== element.id)
              } else if (element.type === "artwork") {
                updatedFloor.artworks = updatedFloor.artworks.filter((a) => a.id !== element.id)
              } else if (element.type === "door") {
                updatedFloor.doors = updatedFloor.doors.filter((d) => d.id !== element.id)
              } else if (element.type === "verticalLink") {
                updatedFloor.verticalLinks = updatedFloor.verticalLinks.filter((v) => v.id !== element.id)
              } else if (element.type === "wall") {
                updatedFloor.walls = updatedFloor.walls.filter((w) => w.id !== element.id)
              }
            })
          }

          return updatedFloor
        })

        const newState = {
          floors: newFloors,
          selectedElementId: null,
          selectedElementType: null,
          selectedElements: [],
        }
        
        updateState(newState)
        
        // Sauvegarder dans l'historique
        const deletedElementsCount = state.selectedElementId ? 1 : 
                                   state.selectedElements.filter(el => el.type !== "vertex").length
        const actionDescription = deletedElementsCount === 1 ? "Supprimer élément" : 
                                `Supprimer ${deletedElementsCount} éléments`
        saveToHistory({ ...state, ...newState }, actionDescription)
      }

      if (e.key === "Escape") {
        updateState({
          currentPolygon: [],
          selectedElementId: null,
          selectedElementType: null,
          selectedTool: "select",
          contextMenu: null,
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [state, updateState])

  return (
    <div className="flex h-screen w-screen flex-col bg-background overflow-hidden">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 md:px-6 py-3 min-h-[60px] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-foreground">
            <svg className="h-5 w-5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
              />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold">Museum Floor Plan Editor</h1>
            {isLoading && (
              <span className="text-xs text-muted-foreground">Chargement du plan...</span>
            )}
            {!isLoading && lastSaved && (
              <span className="text-xs text-green-600">
                ✅ Sauvegardé automatiquement {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Boutons Undo/Redo */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => {
                if (state.historyIndex > 0) {
                  setState(prev => ({
                    ...prev.history[prev.historyIndex - 1],
                    historyIndex: prev.historyIndex - 1,
                  }))
                }
              }}
              disabled={state.historyIndex <= 0}
              className="rounded bg-muted px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Annuler (Ctrl+Z)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
            </button>
            
            <button
              onClick={() => {
                if (state.historyIndex < state.history.length - 1) {
                  setState(prev => ({
                    ...prev.history[prev.historyIndex + 1],
                    historyIndex: prev.historyIndex + 1,
                  }))
                }
              }}
              disabled={state.historyIndex >= state.history.length - 1}
              className="rounded bg-muted px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refaire (Ctrl+Y)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"
                />
              </svg>
            </button>
          </div>

          <button
            onClick={recenterView}
            className="rounded bg-muted px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80"
            title="Recenter view on floor plan"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
              />
            </svg>
          </button>

          <button
            onClick={() => autoSave(state, true)}
            disabled={saveStatus === 'saving'}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              saveStatus === 'success' 
                ? 'bg-green-600 text-white' 
                : saveStatus === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-accent text-accent-foreground hover:opacity-90'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saveStatus === 'saving' && '⏳ Sauvegarde...'}
            {saveStatus === 'success' && '✅ Sauvegardé !'}
            {saveStatus === 'error' && '❌ Erreur'}
            {saveStatus === 'idle' && '💾 Sauvegarder'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Toolbar 
          selectedTool={state.selectedTool} 
          onSelectTool={selectTool}
          measurements={state.measurements}
          onToggleMeasurements={() => updateState({
            measurements: {
              ...state.measurements,
              showMeasurements: !state.measurements.showMeasurements,
            }
          })}
        />

        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <FloorTabs
            floors={state.floors}
            currentFloorId={state.currentFloorId}
            onSwitchFloor={switchFloor}
            onAddFloor={addFloor}
            onDeleteFloor={deleteFloor}
          />

          <Canvas
            state={state}
            updateState={updateStateWithMeasurements}
            updateStateTemporary={updateStateTemporary}
            saveToHistory={saveToHistory}
            currentFloor={currentFloor}
            onNavigateToFloor={switchFloor}
            onRecenter={recenterView}
            onArtworkDoubleClick={handleArtworkDoubleClick}
          />
        </div>

        {/* Panneau de propriétés désactivé temporairement
        {state.selectedElementId && (
          <PropertiesPanel state={state} updateState={updateState} saveToHistory={saveToHistory} currentFloor={currentFloor} />
        )}
        */}
      </div>

      {/* Context menu is rendered inside the Canvas (so it has x/y coordinates). */}
      
      {pdfDialogArtwork && (
        <ArtworkPdfDialog
          artwork={pdfDialogArtwork}
          onClose={() => setPdfDialogArtwork(null)}
          onSave={handleSavePdfToArtwork}
        />
      )}
    </div>
  )
}
