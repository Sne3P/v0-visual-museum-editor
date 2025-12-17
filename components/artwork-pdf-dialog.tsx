"use client"

import { useState, useRef } from "react"
import type { Artwork } from "@/lib/types"

interface ArtworkPdfDialogProps {
  artwork: Artwork
  onClose: () => void
  onSave: (artworkId: string, pdfFile: File, pdfUrl: string, title?: string, base64?: string) => void
}

export function ArtworkPdfDialog({ artwork, onClose, onSave }: ArtworkPdfDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string>(artwork.pdfLink || "")
  const [artworkTitle, setArtworkTitle] = useState<string>(artwork.name || "")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Vérifier le type MIME
    if (file.type !== "application/pdf") {
      alert("Veuillez sélectionner un fichier PDF valide")
      return
    }
    
    // Vérifier l'en-tête du fichier
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const header = new TextDecoder().decode(bytes.slice(0, 4))
      
      if (!header.startsWith('%PDF')) {
        alert("Le fichier sélectionné n'est pas un PDF valide (en-tête manquant)")
        return
      }
      
      setSelectedFile(file)
    } catch (error) {
      console.error('Erreur validation PDF:', error)
      alert("Erreur lors de la validation du fichier PDF")
    }
  }

  const handleSave = async () => {
    if (!selectedFile) {
      alert("Veuillez sélectionner un fichier PDF")
      return
    }

    if (!artworkTitle.trim()) {
      alert("Veuillez saisir un titre pour l'œuvre")
      return
    }

    setUploading(true)
    try {
      // Convertir le fichier en base64 pour stockage temporaire
      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string
        // Extraire seulement la partie base64 (après "data:application/pdf;base64,")
        const base64 = dataUrl.split(',')[1]
        
        // Stocker temporairement le fichier dans l'état (sera sauvé lors de l'export)
        await onSave(artwork.id, selectedFile, "", artworkTitle, base64)
        setCurrentPdfUrl(`temporary-${artwork.id}`)
        alert("PDF et titre assignés avec succès à l'œuvre! (Sera sauvé définitivement lors de l'export)")
        onClose()
      }
      reader.onerror = () => {
        alert("Erreur lors de la lecture du fichier PDF")
        setUploading(false)
      }
      reader.readAsDataURL(selectedFile)
    } catch (error) {
      console.error("Erreur lors du traitement:", error)
      alert("Erreur lors du traitement du PDF")
      setUploading(false)
    }
  }

  const handleRemovePdf = async () => {
    if (!confirm("Voulez-vous vraiment supprimer le PDF associé à cette œuvre?")) {
      return
    }

    try {
      // Supprimer le PDF temporairement (sera effectif lors de l'export)
      await onSave(artwork.id, null as any, "", artworkTitle, "")
      setCurrentPdfUrl("")
      setSelectedFile(null)
      alert("PDF supprimé avec succès! (Sera effectif lors de l'export)")
    } catch (error) {
      console.error("Erreur lors de la suppression:", error)
      alert("Erreur lors de la suppression du PDF")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Assigner un PDF</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <h3 className="mb-2 font-medium">Œuvre sélectionnée:</h3>
          <div className="rounded border border-border bg-muted p-3">
            <p className="font-medium">{artwork.name || `Œuvre ${artwork.id}`}</p>
            <p className="text-sm text-muted-foreground">ID: {artwork.id}</p>
            <p className="text-sm text-muted-foreground">
              Position: ({artwork.xy[0]}, {artwork.xy[1]})
            </p>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="mb-2 font-medium">Titre de l'œuvre:</h3>
          <input
            type="text"
            value={artworkTitle}
            onChange={(e) => setArtworkTitle(e.target.value)}
            placeholder="Entrez le titre de l'œuvre..."
            className="w-full rounded border border-border bg-background p-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Ce titre sera utilisé lors du traitement RAG
          </p>
        </div>

        {currentPdfUrl && (
          <div className="mb-4">
            <h3 className="mb-2 font-medium">PDF actuel:</h3>
            <div className="flex items-center justify-between rounded border border-border bg-muted p-3">
              <span className="text-sm">{currentPdfUrl}</span>
              <button
                onClick={handleRemovePdf}
                className="text-red-600 hover:text-red-700"
                title="Supprimer le PDF"
              >
                🗑️
              </button>
            </div>
          </div>
        )}

        <div className="mb-4">
          <h3 className="mb-2 font-medium">
            {currentPdfUrl ? "Remplacer le PDF:" : "Sélectionner un PDF:"}
          </h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            className="mb-2 w-full rounded border border-border bg-background p-2 text-sm"
          />
          {selectedFile && (
            <div className="text-sm text-muted-foreground">
              Fichier sélectionné: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!selectedFile || uploading}
            className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? "Sauvegarde..." : currentPdfUrl ? "Remplacer PDF" : "Assigner PDF"}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Annuler
          </button>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          <p>💡 Astuce: Double-cliquez sur une œuvre pour assigner ou modifier son PDF</p>
          <p>📄 Formats acceptés: PDF uniquement</p>
        </div>
      </div>
    </div>
  )
}