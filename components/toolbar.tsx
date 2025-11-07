"use client"

import type { Tool, MeasurementState } from "@/lib/types"
import { 
  MousePointer2, 
  PenTool, 
  Square, 
  Circle, 
  Move3D, 
  Triangle, 
  Image, 
  DoorOpen,
  Minus,
  TrendingUp, 
  ArrowUpDown,
  Ruler
} from "lucide-react"

interface ToolbarProps {
  selectedTool: Tool
  onSelectTool: (tool: Tool) => void
  measurements: MeasurementState
  onToggleMeasurements: () => void
}

const tools: { id: Tool; icon: React.ComponentType<{ className?: string }>; label: string; description: string }[] = [
  { 
    id: "select", 
    icon: MousePointer2, 
    label: "Sélectionner", 
    description: "Sélectionner et déplacer"
  },
  {
    id: "room",
    icon: PenTool,
    label: "Pièce libre",
    description: "Dessiner une pièce"
  },
  { 
    id: "rectangle", 
    icon: Square, 
    label: "Rectangle", 
    description: "Pièce rectangulaire"
  },
  { 
    id: "circle", 
    icon: Circle, 
    label: "Cercle", 
    description: "Pièce circulaire"
  },
  { 
    id: "arc", 
    icon: Move3D, 
    label: "Arc", 
    description: "Pièce en arc"
  },
  { 
    id: "triangle", 
    icon: Triangle, 
    label: "Triangle", 
    description: "Pièce triangulaire"
  },
  {
    id: "artwork",
    icon: Image,
    label: "Œuvre d'art",
    description: "Placement intelligent le long des murs"
  },
  {
    id: "door",
    icon: DoorOpen,
    label: "Porte",
    description: "Accès entre pièces avec contraintes"
  },
  {
    id: "wall",
    icon: Minus,
    label: "Mur intérieur",
    description: "Murs avec système de snap intelligent"
  },
  { 
    id: "stairs", 
    icon: TrendingUp, 
    label: "Escalier", 
    description: "Connexion multi-étages automatique"
  },
  { 
    id: "elevator", 
    icon: ArrowUpDown, 
    label: "Ascenseur", 
    description: "Transport vertical multi-étages"
  },
]

export function Toolbar({ selectedTool, onSelectTool, measurements, onToggleMeasurements }: ToolbarProps) {
  return (
    <div className="flex w-16 md:w-20 shrink-0 flex-col items-center gap-1 md:gap-2 border-r border-border bg-card/95 backdrop-blur-md py-2 md:py-4 px-1 md:px-2 relative z-10 overflow-y-auto">
      <div className="text-xs font-semibold text-muted-foreground mb-1 md:mb-2 uppercase tracking-wider hidden md:block">Outils</div>
      {tools.map((tool) => {
        const IconComponent = tool.icon
        return (
          <div key={tool.id} className="group relative w-full flex justify-center">
            <button
              onClick={() => onSelectTool(tool.id)}
              className={`relative flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ease-out ${
                selectedTool === tool.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-primary/40 scale-105"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:scale-105 hover:shadow-md border border-transparent hover:border-border/50"
              }`}
              title={tool.label}
            >
              <IconComponent className="h-4 w-4 md:h-5 md:w-5" />
              
              {selectedTool === tool.id && (
                <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary-foreground animate-pulse" />
              )}
            </button>

            {/* Tooltip avec z-index très élevé */}
            <div className="pointer-events-none absolute left-full ml-4 z-50 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1 top-1/2 -translate-y-1/2">
              <div className="relative animate-fade-in">
                <div className="min-w-max max-w-xs rounded-lg bg-gray-900 dark:bg-gray-800 text-white shadow-2xl px-3 py-2 border border-gray-700">
                  <div className="text-sm font-medium whitespace-nowrap">{tool.label}</div>
                  <div className="text-xs text-gray-300 mt-0.5 whitespace-nowrap">{tool.description}</div>
                </div>
                {/* Flèche pointant vers le bouton */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1">
                  <div className="w-0 h-0 border-4 border-transparent border-r-gray-900 dark:border-r-gray-800" />
                </div>
              </div>
            </div>
          </div>
        )
      })}
      
      {/* Séparateur */}
      <div className="w-6 md:w-8 h-px bg-border my-1 md:my-2" />
      
      {/* Bouton Mesures */}
      <div className="group relative w-full flex justify-center">
        <button
          onClick={onToggleMeasurements}
          className={`relative flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ease-out ${
            measurements.showMeasurements
              ? "bg-green-600 text-white shadow-lg shadow-green-600/30 ring-2 ring-green-600/40 scale-105"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:scale-105 hover:shadow-md border border-transparent hover:border-border/50"
          }`}
          title="Mesures"
        >
          <Ruler className="h-4 w-4 md:h-5 md:w-5" />
          
          {measurements.showMeasurements && (
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-white animate-pulse" />
          )}
        </button>

        {/* Tooltip */}
        <div className="pointer-events-none absolute left-full ml-4 z-50 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1 top-1/2 -translate-y-1/2">
          <div className="relative animate-fade-in">
            <div className="min-w-max max-w-xs rounded-lg bg-gray-900 dark:bg-gray-800 text-white shadow-2xl px-3 py-2 border border-gray-700">
              <div className="text-sm font-medium whitespace-nowrap">
                {measurements.showMeasurements ? "Masquer les mesures" : "Afficher les mesures"}
              </div>
              <div className="text-xs text-gray-300 mt-0.5 whitespace-nowrap">
                Distances et surfaces en mètres
              </div>
            </div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1">
              <div className="w-0 h-0 border-4 border-transparent border-r-gray-900 dark:border-r-gray-800" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
