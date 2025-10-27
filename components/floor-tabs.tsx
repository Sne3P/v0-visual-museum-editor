"use client"

import type { Floor } from "@/lib/types"

interface FloorTabsProps {
  floors: Floor[]
  currentFloorId: string
  onSwitchFloor: (floorId: string) => void
  onAddFloor: () => void
}

export function FloorTabs({ floors, currentFloorId, onSwitchFloor, onAddFloor }: FloorTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border bg-muted px-4 py-2">
      {floors.map((floor) => (
        <button
          key={floor.id}
          onClick={() => onSwitchFloor(floor.id)}
          className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
            currentFloorId === floor.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {floor.name}
        </button>
      ))}

      <button
        onClick={onAddFloor}
        className="ml-2 flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        title="Add Floor"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}
