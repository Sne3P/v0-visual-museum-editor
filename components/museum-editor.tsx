"use client"

import { useState, useCallback, useEffect } from "react"
import { Canvas } from "./canvas"
import { Toolbar } from "./toolbar"
import { FloorTabs } from "./floor-tabs"
import { PropertiesPanel } from "./properties-panel"
import { ExportDialog } from "./export-dialog"
import type { EditorState, Tool, Floor } from "@/lib/types"

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
  })

  const [showExport, setShowExport] = useState(false)

  const currentFloor = state.floors.find((f) => f.id === state.currentFloorId)!

  const updateState = useCallback((updates: Partial<EditorState>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates }
      if (updates.floors) {
        const newHistory = prev.history.slice(0, prev.historyIndex + 1)
        newHistory.push(newState)
        return {
          ...newState,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        }
      }
      return newState
    })
  }, [])

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
    updateState({
      floors: [...state.floors, newFloor],
      currentFloorId: newFloor.id,
    })
  }, [state.floors, updateState])

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

      if (e.key === "Delete" && state.selectedElementId) {
        e.preventDefault()
        const newFloors = state.floors.map((floor) => {
          if (floor.id !== state.currentFloorId) return floor

          return {
            ...floor,
            rooms:
              state.selectedElementType === "room"
                ? floor.rooms.filter((r) => r.id !== state.selectedElementId)
                : floor.rooms,
            artworks:
              state.selectedElementType === "artwork"
                ? floor.artworks.filter((a) => a.id !== state.selectedElementId)
                : floor.artworks,
            doors:
              state.selectedElementType === "door"
                ? floor.doors.filter((d) => d.id !== state.selectedElementId)
                : floor.doors,
            verticalLinks:
              state.selectedElementType === "verticalLink"
                ? floor.verticalLinks.filter((v) => v.id !== state.selectedElementId)
                : floor.verticalLinks,
          }
        })

        updateState({
          floors: newFloors,
          selectedElementId: null,
          selectedElementType: null,
        })
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
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
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

      <div className="flex flex-1 overflow-hidden">
        <Toolbar selectedTool={state.selectedTool} onSelectTool={selectTool} />

        <div className="flex flex-1 flex-col">
          <FloorTabs
            floors={state.floors}
            currentFloorId={state.currentFloorId}
            onSwitchFloor={switchFloor}
            onAddFloor={addFloor}
          />

          <Canvas
            state={state}
            updateState={updateState}
            currentFloor={currentFloor}
            onNavigateToFloor={switchFloor}
            onRecenter={recenterView}
          />
        </div>

        {state.selectedElementId && (
          <PropertiesPanel state={state} updateState={updateState} currentFloor={currentFloor} />
        )}
      </div>

      {/* Context menu is rendered inside the Canvas (so it has x/y coordinates). */}

      {showExport && <ExportDialog state={state} onClose={() => setShowExport(false)} />}
    </div>
  )
}
