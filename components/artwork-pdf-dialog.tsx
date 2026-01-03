"use client"

/**
 * PLACEHOLDER - Fichier temporaire pour merge avec main
 * Ce fichier sera remplacé par la version de main lors du merge
 * Ou migré vers la nouvelle architecture features/ si nécessaire
 */

import type { Artwork } from "@/core/entities"

interface ArtworkPdfDialogProps {
  artwork: Artwork
  onClose: () => void
  onSave: (artworkId: string, pdfFile: File, pdfUrl: string, title?: string, base64?: string) => void
}

export function ArtworkPdfDialog({ artwork, onClose, onSave }: ArtworkPdfDialogProps) {
  // Placeholder vide - sera remplacé par merge
  return null
}
