"use client"

import { useEffect, useRef } from "react"
import type { EditorState, Floor } from "@/lib/types"
import { findWallSegmentForElement, isElementInRoom } from "@/lib/geometry"

interface ContextMenuProps {
  x: number
  y: number
  type: "background" | "room" | "door" | "verticalLink" | "artwork"
  elementId?: string
  onClose: () => void
  state: EditorState
  updateState: (updates: Partial<EditorState>) => void
  currentFloor: Floor
  onNavigateToFloor?: (floorId: string) => void
}

export function ContextMenu({
  x,
  y,
  type,
  elementId,
  onClose,
  state,
  updateState,
  currentFloor,
  onNavigateToFloor,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        if (isMountedRef.current && typeof onClose === "function") {
          onClose()
        }
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isMountedRef.current && typeof onClose === "function") {
          onClose()
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      isMountedRef.current = false
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  const handleDelete = () => {
    if (elementId) {
      const newFloors = state.floors.map((floor) => {
        if (floor.id !== state.currentFloorId) return floor

        if (type === "room") {
          const room = floor.rooms.find((r) => r.id === elementId)
          if (!room) return floor

          const doorsToDelete = floor.doors.filter((door) => {
            const wallInfo = findWallSegmentForElement(door.segment, [room])
            return wallInfo !== null
          })

          const linksToDelete = floor.verticalLinks.filter((link) => {
            const wallInfo = findWallSegmentForElement(link.segment, [room])
            return wallInfo !== null
          })

          const artworksToDelete = floor.artworks.filter((artwork) => isElementInRoom(artwork, room))

          return {
            ...floor,
            rooms: floor.rooms.filter((r) => r.id !== elementId),
            doors: floor.doors.filter((d) => !doorsToDelete.includes(d)),
            verticalLinks: floor.verticalLinks.filter((l) => !linksToDelete.includes(l)),
            artworks: floor.artworks.filter((a) => !artworksToDelete.includes(a)),
          }
        } else if (type === "door") {
          return { ...floor, doors: floor.doors.filter((d) => d.id !== elementId) }
        } else if (type === "verticalLink") {
          return { ...floor, verticalLinks: floor.verticalLinks.filter((l) => l.id !== elementId) }
        } else if (type === "artwork") {
          return { ...floor, artworks: floor.artworks.filter((a) => a.id !== elementId) }
        }
        return floor
      })

      updateState({
        floors: newFloors,
        selectedElementId: null,
        selectedElementType: null,
      })
    }
    if (typeof onClose === "function") {
      onClose()
    }
  }

  const handleChangeDirection = (direction: "up" | "down" | "both") => {
    if (elementId && type === "verticalLink") {
      const newFloors = state.floors.map((floor) => {
        if (floor.id !== state.currentFloorId) return floor

        return {
          ...floor,
          verticalLinks: floor.verticalLinks.map((link) => {
            if (link.id === elementId) {
              return { ...link, direction }
            }
            return link
          }),
        }
      })

      updateState({ floors: newFloors })
    }
    if (typeof onClose === "function") {
      onClose()
    }
  }

  const handleNavigate = (direction: "up" | "down") => {
    if (elementId && type === "verticalLink" && onNavigateToFloor) {
      const link = currentFloor.verticalLinks.find((l) => l.id === elementId)
      if (link) {
        const currentFloorIndex = state.floors.findIndex((f) => f.id === state.currentFloorId)
        const targetFloorIndex = direction === "up" ? currentFloorIndex + 1 : currentFloorIndex - 1

        if (targetFloorIndex >= 0 && targetFloorIndex < state.floors.length) {
          onNavigateToFloor(state.floors[targetFloorIndex].id)
        }
      }
    }
    if (typeof onClose === "function") {
      onClose()
    }
  }

  const handleIncreaseGridDetail = () => {
    updateState({
      zoom: Math.min(5, state.zoom * 1.5),
    })
    if (typeof onClose === "function") {
      onClose()
    }
  }

  const handleDecreaseGridDetail = () => {
    updateState({
      zoom: Math.max(0.1, state.zoom / 1.5),
    })
    if (typeof onClose === "function") {
      onClose()
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-background shadow-lg"
      style={{ left: x, top: y }}
    >
      {type === "verticalLink" && (
        <>
          <button
            onClick={() => handleNavigate("up")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-t-lg"
          >
            Go to Floor Above ↑
          </button>
          <button
            onClick={() => handleNavigate("down")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Go to Floor Below ↓
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleChangeDirection("up")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Direction: Up Only ↑
          </button>
          <button
            onClick={() => handleChangeDirection("down")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Direction: Down Only ↓
          </button>
          <button
            onClick={() => handleChangeDirection("both")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Direction: Both ↕
          </button>
          <div className="my-1 h-px bg-border" />
        </>
      )}

      {type !== "background" && (
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-b-lg"
        >
          Delete
        </button>
      )}

      {type === "background" && (
        <>
          <button
            onClick={handleIncreaseGridDetail}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-t-lg"
          >
            Zoom In (More Detail)
          </button>
          <button
            onClick={handleDecreaseGridDetail}
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-b-lg"
          >
            Zoom Out (Less Detail)
          </button>
        </>
      )}
    </div>
  )
}
