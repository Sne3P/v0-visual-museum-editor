"use client"

import type { EditorState, Floor } from "@/lib/types"

interface PropertiesPanelProps {
  state: EditorState
  updateState: (updates: Partial<EditorState>) => void
  currentFloor: Floor
}

export function PropertiesPanel({ state, updateState, currentFloor }: PropertiesPanelProps) {
  const element =
    state.selectedElementType === "room"
      ? currentFloor.rooms.find((r) => r.id === state.selectedElementId)
      : state.selectedElementType === "artwork"
        ? currentFloor.artworks.find((a) => a.id === state.selectedElementId)
        : state.selectedElementType === "door"
          ? currentFloor.doors.find((d) => d.id === state.selectedElementId)
          : state.selectedElementType === "wall"
            ? currentFloor.walls.find((w) => w.id === state.selectedElementId)
            : null

  if (!element) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card/95 backdrop-blur-md p-6">
        <div className="text-center text-muted-foreground">
          <div className="mb-4 text-5xl"></div>
          <div className="text-lg font-semibold mb-2">Aucune selection</div>
          <div className="text-sm opacity-70">
            Selectionnez un element pour voir ses proprietes
          </div>
        </div>
      </div>
    )
  }

  const updateElement = (updates: any) => {
    const newFloors = state.floors.map((floor) => {
      if (floor.id !== state.currentFloorId) return floor

      return {
        ...floor,
        rooms: state.selectedElementType === "room"
          ? floor.rooms.map((r) => (r.id === state.selectedElementId ? { ...r, ...updates } : r))
          : floor.rooms,
        artworks: state.selectedElementType === "artwork"
          ? floor.artworks.map((a) => (a.id === state.selectedElementId ? { ...a, ...updates } : a))
          : floor.artworks,
        doors: state.selectedElementType === "door"
          ? floor.doors.map((d) => (d.id === state.selectedElementId ? { ...d, ...updates } : d))
          : floor.doors,
        walls: state.selectedElementType === "wall"
          ? floor.walls.map((w) => (w.id === state.selectedElementId ? { ...w, ...updates } : w))
          : floor.walls,
      }
    })

    updateState({ floors: newFloors })
  }

  return (
    <div className="w-80 border-l border-border bg-card/95 backdrop-blur-md p-4">
      <h2 className="text-lg font-semibold mb-4">Proprietes</h2>
      
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Type</label>
          <div className="text-sm">{state.selectedElementType}</div>
        </div>
        
        <div>
          <label className="text-sm font-medium text-muted-foreground">ID</label>
          <div className="text-xs font-mono bg-muted p-2 rounded">
            {element.id}
          </div>
        </div>

        {state.selectedElementType === "artwork" && "name" in element && (
          <div>
            <label className="block text-sm font-medium mb-1">Nom</label>
            <input
              type="text"
              value={element.name || ""}
              onChange={(e) => updateElement({ name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm"
              placeholder="Nom de l'oeuvre"
            />
          </div>
        )}

        {state.selectedElementType === "wall" && "thickness" in element && (
          <div>
            <label className="block text-sm font-medium mb-1">Epaisseur (m)</label>
            <input
              type="number"
              value={element.thickness || 0.15}
              onChange={(e) => updateElement({ thickness: Number.parseFloat(e.target.value) })}
              step="0.05"
              min="0.05"
              max="0.5"
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        )}

        {state.selectedElementType === "room" && "polygon" in element && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Vertices</label>
            <div className="text-sm">{element.polygon.length}</div>
          </div>
        )}
      </div>
    </div>
  )
}
