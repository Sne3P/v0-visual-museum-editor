"use client"

import { useState, useRef } from "react"
import type { Artwork } from "@/lib/types"

interface ArtworkPdfDialogProps {
  artwork: Artwork
  onClose: () => void
  onSave: (artworkId: string, pdfFile: File, pdfUrl: string) => void
}

export function ArtworkPdfDialog({ artwork, onClose, onSave }: ArtworkPdfDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string>(artwork.pdfLink || "")
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

    setUploading(true)
    try {
      // Créer un FormData pour l'upload
      const formData = new FormData()
      formData.append('artworkId', artwork.id)
      formData.append('pdfFile', selectedFile)

      // Envoyer le fichier à l'API
      const response = await fetch('/api/artwork-pdf', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (response.ok) {
        await onSave(artwork.id, selectedFile, result.pdfLink)
        setCurrentPdfUrl(result.pdfLink)
        alert("PDF assigné avec succès à l'œuvre!")
        onClose()
      } else {
        console.error('Erreur API:', result.error)
        alert(`Erreur lors de l'upload: ${result.error}`)
      }
    } catch (error) {
      console.error("Erreur lors de l'upload:", error)
      alert("Erreur de connexion lors de l'upload du PDF")
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePdf = async () => {
    if (!confirm("Voulez-vous vraiment supprimer le PDF associé à cette œuvre?")) {
      return
    }

    setUploading(true)
    try {
      // Envoyer une requête pour supprimer le PDF
      const formData = new FormData()
      formData.append('artworkId', artwork.id)
      // Pas de fichier = suppression

      const response = await fetch('/api/artwork-pdf', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (response.ok) {
        await onSave(artwork.id, null as any, "")
        setCurrentPdfUrl("")
        setSelectedFile(null)
        alert("PDF supprimé avec succès")
      } else {
        console.error('Erreur API:', result.error)
        alert(`Erreur lors de la suppression: ${result.error}`)
      }
    } catch (error) {
      console.error("Erreur lors de la suppression:", error)
      alert("Erreur de connexion lors de la suppression du PDF")
    } finally {
      setUploading(false)
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