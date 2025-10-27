"use client"

import { useState } from "react"
import type { EditorState } from "@/lib/types"

interface ExportDialogProps {
  state: EditorState
  onClose: () => void
}

export function ExportDialog({ state, onClose }: ExportDialogProps) {
  const [copied, setCopied] = useState(false)

  const exportData = {
    museum_id: "MUS_001",
    grid_size_m: state.gridSize,
    floors: state.floors.map((floor) => ({
      id: floor.id,
      rooms: floor.rooms.map((room) => ({
        id: room.id,
        polygon: room.polygon.map((p) => [p.x, p.y]),
      })),
      doors: floor.doors.map((door) => ({
        id: door.id,
        room_a: door.room_a,
        room_b: door.room_b,
        xy: door.xy,
      })),
      artworks: floor.artworks.map((artwork) => ({
        id: artwork.id,
        xy: artwork.xy,
        size: artwork.size,
        name: artwork.name,
        pdf_id: artwork.pdf_id,
      })),
      vertical_links: floor.verticalLinks.map((link) => ({
        id: link.id,
        type: link.type,
        xy: link.xy,
        to_floor: link.to_floor,
      })),
    })),
    assets: [],
  }

  const jsonString = JSON.stringify(exportData, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "museum-floor-plan.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Export JSON</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <pre className="mb-4 max-h-96 overflow-auto rounded border border-border bg-muted p-4 text-xs">
          {jsonString}
        </pre>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
          <button
            onClick={handleDownload}
            className="rounded border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Download JSON
          </button>
        </div>
      </div>
    </div>
  )
}
