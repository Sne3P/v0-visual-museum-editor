"use client"

import type { Floor } from "@/lib/types"
import { Plus, X, Copy, ArrowUp, ArrowDown } from "lucide-react"
import { useState } from "react"

interface FloorTabsProps {
  floors: readonly Floor[]
  currentFloorId: string
  onSwitchFloor: (floorId: string) => void
  onAddFloor: () => void
  onDeleteFloor?: (floorId: string) => void
  onDuplicateFloor?: (floorId: string) => void
  onMoveFloorUp?: (floorId: string) => void
  onMoveFloorDown?: (floorId: string) => void
}

export function FloorTabs({ 
  floors, 
  currentFloorId, 
  onSwitchFloor, 
  onAddFloor,
  onDeleteFloor,
  onDuplicateFloor,
  onMoveFloorUp,
  onMoveFloorDown
}: FloorTabsProps) {
  const [showActions, setShowActions] = useState<string | null>(null)
  
  const currentFloorIndex = floors.findIndex(f => f.id === currentFloorId)
  const canMoveUp = currentFloorIndex > 0
  const canMoveDown = currentFloorIndex < floors.length - 1
  const canDelete = floors.length > 1

  return (
    <div className="flex items-center gap-1 border-b border-border bg-card/95 backdrop-blur-md px-4 py-2 relative z-10">
      <div className="text-xs font-semibold text-muted-foreground mr-3 uppercase tracking-wider">
        Étages
      </div>
      
      {floors.map((floor, index) => (
        <div
          key={floor.id}
          className="relative group"
          onMouseEnter={() => setShowActions(floor.id)}
          onMouseLeave={() => setShowActions(null)}
        >
          <button
            onClick={() => onSwitchFloor(floor.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
              currentFloorId === floor.id
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-2 ring-primary/40"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-md border border-transparent hover:border-border/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-xs opacity-70">#{index + 1}</span>
              {floor.name}
            </span>
          </button>

          {/* Actions menu */}
          {showActions === floor.id && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-max rounded-lg bg-card border border-border shadow-xl animate-fade-in">
              <div className="p-1">
                {onDuplicateFloor && (
                  <button
                    onClick={() => onDuplicateFloor(floor.id)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Copy className="h-4 w-4" />
                    Dupliquer
                  </button>
                )}
                
                {onMoveFloorUp && canMoveUp && (
                  <button
                    onClick={() => onMoveFloorUp(floor.id)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <ArrowUp className="h-4 w-4" />
                    Monter
                  </button>
                )}
                
                {onMoveFloorDown && canMoveDown && (
                  <button
                    onClick={() => onMoveFloorDown(floor.id)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <ArrowDown className="h-4 w-4" />
                    Descendre
                  </button>
                )}
                
                {onDeleteFloor && canDelete && (
                  <>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => onDeleteFloor(floor.id)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={onAddFloor}
        className="ml-4 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-accent-foreground hover:scale-105 hover:shadow-md border border-transparent hover:border-border/50"
        title="Ajouter un étage"
      >
        <Plus className="h-4 w-4" />
      </button>
      
      {floors.length > 0 && (
        <div className="ml-4 text-xs text-muted-foreground border-l border-border pl-4">
          {floors.length} étage{floors.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
