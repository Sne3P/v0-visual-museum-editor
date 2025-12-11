"use client"

import { useState, useCallback, useEffect } from "react"
import { Canvas } from "./canvas"
import { Toolbar } from "./toolbar"
import { FloorTabs } from "./floor-tabs"
import { PropertiesPanel } from "./properties-panel"
import { ExportDialog } from "./export-dialog"
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

  const [showExport, setShowExport] = useState(false)
  const [pdfDialogArtwork, setPdfDialogArtwork] = useState<Artwork | null>(null)

  const currentFloor = state.floors.find((f) => f.id === state.currentFloorId)!

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

  const addFloor = useCallback(() => {
    const newFloorNum = state.floors.length + 1
    const newFloor: Floor = {
      id: `F${newFloorNum}`,
      name: `Floor ${newFloorNum}`,
      rooms: [],
      doors: [],
      walls: [],
      artworks: [],
      verticalLinks: [],
      escalators: [],
      elevators: [],
    }
    updateStateWithMeasurements({
      floors: [...state.floors, newFloor],
      currentFloorId: newFloor.id,
    })
  }, [state.floors, updateStateWithMeasurements])

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
  const handleSavePdfToArtwork = useCallback(async (artworkId: string, pdfFile: File | null, pdfUrl: string) => {
    const newFloors = state.floors.map(floor => {
      if (floor.id !== state.currentFloorId) return floor
      
      return {
        ...floor,
        artworks: floor.artworks.map(artwork => {
          if (artwork.id !== artworkId) return artwork
          
          return {
            ...artwork,
            pdfLink: pdfUrl
          }
        })
      }
    })

    updateStateWithMeasurements({ floors: newFloors }, true, `Assigner PDF à l'œuvre ${artworkId}`)

    // Ici, dans un vrai projet, vous pourriez aussi uploader le fichier vers un serveur
    if (pdfFile) {
      console.log(`PDF "${pdfFile.name}" assigné à l'œuvre ${artworkId}`)
      
      // Simulation d'un upload vers la base de données
      try {
        // TODO: Implémenter l'upload réel vers le serveur et la base de données
        // await uploadPdfToServer(pdfFile, artworkId)
        console.log("PDF sauvegardé avec succès (simulation)")
      } catch (error) {
        console.error("Erreur lors de la sauvegarde du PDF:", error)
      }
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
          <h1 className="text-lg font-semibold">Museum Floor Plan Editor</h1>
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
            onClick={() => setShowExport(true)}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            Export JSON
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

      {showExport && <ExportDialog state={state} onClose={() => setShowExport(false)} />}
      
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
