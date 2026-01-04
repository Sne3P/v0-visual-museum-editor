"use client"

import { useState, useRef } from "react"
import type { Artwork } from "@/core/entities"

interface ArtworkPdfDialogProps {
  artwork: Artwork
  onClose: () => void
  onSave: (artworkId: string, pdfFile: File, pdfUrl: string, title?: string, base64?: string) => void
}

export function ArtworkPdfDialog({ artwork, onClose, onSave }: ArtworkPdfDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string>(artwork.pdfPath || artwork.pdfLink || "")
  const [artworkTitle, setArtworkTitle] = useState<string>(artwork.name || "")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === "application/pdf") {
      setSelectedFile(file)
    } else {
      alert("Veuillez sélectionner un fichier PDF valide")
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
        const base64 = e.target?.result as string
        
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
          <label htmlFor="artwork-title" className="block text-sm font-medium mb-2">
            Titre de l'œuvre
          </label>
          <input
            id="artwork-title"
            type="text"
            value={artworkTitle}
            onChange={(e) => setArtworkTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Entrez le titre de l'œuvre"
          />
        </div>

        {currentPdfUrl && (
          <div className="mb-4 rounded border border-green-500/50 bg-green-500/10 p-3">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              ✓ PDF déjà associé
            </p>
            <button
              onClick={handleRemovePdf}
              className="mt-2 text-sm text-destructive hover:underline"
            >
              Supprimer le PDF
            </button>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Sélectionner un PDF
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            className="w-full text-sm"
          />
          {selectedFile && (
            <p className="mt-2 text-sm text-muted-foreground">
              Fichier sélectionné: {selectedFile.name}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={uploading || !selectedFile}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? "Traitement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  )
}
