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
          : state.selectedElementType === "verticalLink"
            ? currentFloor.verticalLinks.find((v) => v.id === state.selectedElementId)
            : null

  if (!element) return null

  const updateElement = (updates: any) => {
    const newFloors = state.floors.map((floor) => {
      if (floor.id !== state.currentFloorId) return floor

      return {
        ...floor,
        rooms:
          state.selectedElementType === "room"
            ? floor.rooms.map((r) => (r.id === state.selectedElementId ? { ...r, ...updates } : r))
            : floor.rooms,
        artworks:
          state.selectedElementType === "artwork"
            ? floor.artworks.map((a) => (a.id === state.selectedElementId ? { ...a, ...updates } : a))
            : floor.artworks,
        doors:
          state.selectedElementType === "door"
            ? floor.doors.map((d) => (d.id === state.selectedElementId ? { ...d, ...updates } : d))
            : floor.doors,
        verticalLinks:
          state.selectedElementType === "verticalLink"
            ? floor.verticalLinks.map((v) => (v.id === state.selectedElementId ? { ...v, ...updates } : v))
            : floor.verticalLinks,
      }
    })

    updateState({ floors: newFloors })
  }

  return (
    <div className="w-80 border-l border-border bg-background p-4">
      <h2 className="mb-4 text-lg font-semibold">Properties</h2>

      {state.selectedElementType === "artwork" && "name" in element && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={element.name || ""}
              onChange={(e) => updateElement({ name: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">PDF ID</label>
            <input
              type="text"
              value={element.pdf_id || ""}
              onChange={(e) => updateElement({ pdf_id: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Size</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="5"
                value={element.size?.[0] || 1}
                onChange={(e) => updateElement({ size: [Number.parseInt(e.target.value), element.size?.[1] || 1] })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                placeholder="Width"
              />
              <input
                type="number"
                min="1"
                max="5"
                value={element.size?.[1] || 1}
                onChange={(e) => updateElement({ size: [element.size?.[0] || 1, Number.parseInt(e.target.value)] })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                placeholder="Height"
              />
            </div>
          </div>
        </div>
      )}

      {state.selectedElementType === "door" && "room_a" in element && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Room A</label>
            <input
              type="text"
              value={element.room_a || ""}
              onChange={(e) => updateElement({ room_a: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Room B</label>
            <input
              type="text"
              value={element.room_b || ""}
              onChange={(e) => updateElement({ room_b: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {state.selectedElementType === "verticalLink" && "type" in element && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select
              value={element.type}
              onChange={(e) => updateElement({ type: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="stairs">Stairs</option>
              <option value="elevator">Elevator</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Direction</label>
            <select
              value={element.direction || "both"}
              onChange={(e) => updateElement({ direction: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="up">Up (to upper floor)</option>
              <option value="down">Down (to lower floor)</option>
              <option value="both">Both directions</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">To Floor</label>
            <select
              value={element.to_floor || ""}
              onChange={(e) => updateElement({ to_floor: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select floor...</option>
              {state.floors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded bg-muted p-3 text-xs text-muted-foreground">
            💡 Tip: Double-click on this {element.type} to navigate to the connected floor
          </div>
        </div>
      )}

      {state.selectedElementType === "room" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Room ID</label>
            <input
              type="text"
              value={element.id}
              disabled
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm"
            />
          </div>
          <div className="text-sm text-muted-foreground">Vertices: {element.polygon?.length || 0}</div>
        </div>
      )}
    </div>
  )
}
