"use client"

import type { Tool } from "@/lib/types"

interface ToolbarProps {
  selectedTool: Tool
  onSelectTool: (tool: Tool) => void
}

const tools: { id: Tool; icon: string; label: string }[] = [
  { id: "select", icon: "M3 3l18 18M3 3v18M3 3h18", label: "Select" },
  {
    id: "room",
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
    label: "Draw Polygon",
  },
  { id: "rectangle", icon: "M4 4h16v16H4z", label: "Draw Rectangle" },
  { id: "circle", icon: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Draw Circle" },
  { id: "arc", icon: "M12 2a10 10 0 0110 10M12 2v10m0 0l10 0", label: "Draw Arc" },
  { id: "triangle", icon: "M12 2L2 20h20L12 2z", label: "Draw Triangle" },
  {
    id: "artwork",
    icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    label: "Place Artwork Zone",
  },
  {
    id: "door",
    icon: "M8 7v10M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7H6m10 0h2m-2 0V5m0 12v2a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2",
    label: "Place Door",
  },
  { id: "stairs", icon: "M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4z", label: "Place Stairs" },
  { id: "elevator", icon: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4", label: "Place Elevator" },
]

export function Toolbar({ selectedTool, onSelectTool }: ToolbarProps) {
  return (
    <div className="flex w-16 flex-shrink-0 flex-col items-center gap-1 border-r border-border bg-muted py-4">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onSelectTool(tool.id)}
          className={`group relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded transition-all ${
            selectedTool === tool.id
              ? "bg-accent text-accent-foreground shadow-lg ring-2 ring-inset ring-accent-foreground/30 scale-105"
              : "text-muted-foreground hover:bg-background hover:text-foreground hover:scale-105"
          }`}
          title={tool.label}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
          </svg>

          <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
            {tool.label}
          </span>
        </button>
      ))}
    </div>
  )
}
