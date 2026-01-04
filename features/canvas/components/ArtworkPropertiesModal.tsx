/**
 * MODAL DE PROPRIÉTÉS DES ŒUVRES D'ART
 * Support multi-œuvres (zone avec plusieurs œuvres au même endroit)
 */

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Artwork } from '@/core/entities'

interface ArtworkData {
  name: string
  pdfFile?: File | null
  pdfPath?: string  // Chemin du PDF uploadé
  existingPdfPath?: string  // Pour suppression lors de modification
}

interface ArtworkPropertiesModalProps {
  position: readonly [number, number]
  size: readonly [number, number]
  existingArtworks?: Artwork[]  // Œuvres existantes à cet emplacement
  onConfirm: (artworks: ArtworkData[]) => void
  onCancel: () => void
}

export function ArtworkPropertiesModal({
  position,
  size,
  existingArtworks = [],
  onConfirm,
  onCancel
}: ArtworkPropertiesModalProps) {
  const [artworks, setArtworks] = useState<ArtworkData[]>(() => {
    if (existingArtworks.length > 0) {
      return existingArtworks.map(a => ({
        name: a.name || '',
        pdfPath: a.pdfPath || a.pdfLink || a.pdf_id || '',
        existingPdfPath: a.pdfPath || a.pdfLink || a.pdf_id || ''
      }))
    }
    return [{ name: '', pdfPath: '' }]
  })

  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)

  const handleAddArtwork = useCallback(() => {
    setArtworks(prev => [...prev, { name: '', pdfPath: '' }])
  }, [])

  const handleRemoveArtwork = useCallback((index: number) => {
    setArtworks(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleUpdateArtwork = useCallback((index: number, field: 'name', value: string) => {
    setArtworks(prev => prev.map((artwork, i) => 
      i === index ? { ...artwork, [field]: value } : artwork
    ))
  }, [])

  const handleFileChange = useCallback(async (index: number, file: File | null) => {
    if (!file) {
      // Suppression du PDF
      setArtworks(prev => prev.map((artwork, i) => 
        i === index ? { ...artwork, pdfFile: null, pdfPath: '' } : artwork
      ))
      return
    }

    // Upload du PDF
    setUploadingIndex(index)
    
    try {
      const formData = new FormData()
      formData.append('artworkId', `temp-${Date.now()}-${index}`)
      formData.append('pdfFile', file)
      
      // Si modification, ajouter l'ancien chemin pour suppression
      const existingPath = artworks[index].existingPdfPath
      if (existingPath) {
        formData.append('oldPdfPath', existingPath)
      }

      const response = await fetch('/api/artwork-pdf', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur upload')
      }

      // Mettre à jour avec le chemin du fichier uploadé
      setArtworks(prev => prev.map((artwork, i) => 
        i === index ? { 
          ...artwork, 
          pdfFile: file,
          pdfPath: result.pdfPath,
          existingPdfPath: result.pdfPath
        } : artwork
      ))

      console.log('✅ PDF uploadé:', result.pdfPath)
      
    } catch (error) {
      console.error('❌ Erreur upload PDF:', error)
      alert(`Erreur lors de l'upload du PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    } finally {
      setUploadingIndex(null)
    }
  }, [artworks])

  const handleSubmit = useCallback(() => {
    // Filtrer les œuvres vides
    const validArtworks = artworks.filter(a => a.name.trim())
    if (validArtworks.length === 0) {
      alert('Veuillez saisir au moins un nom d\'œuvre')
      return
    }
    onConfirm(validArtworks)
  }, [artworks, onConfirm])

  const [width, height] = size

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-4">
          {existingArtworks.length > 0 ? 'Modifier les œuvres' : 'Nouvelle zone d\'œuvres'}
        </h2>

        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
          <p className="text-sm text-blue-800">
            📐 Position : ({position[0].toFixed(1)}, {position[1].toFixed(1)})
            <br />
            📏 Taille : {width.toFixed(1)} × {height.toFixed(1)} unités
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {artworks.map((artwork, index) => (
            <div key={index} className="border rounded-lg p-4 relative">
              {artworks.length > 1 && (
                <button
                  onClick={() => handleRemoveArtwork(index)}
                  className="absolute top-2 right-2 text-red-600 hover:text-red-800"
                  type="button"
                >
                  ✕
                </button>
              )}

              <div className="mb-3">
                <Label htmlFor={`artwork-name-${index}`}>
                  Nom de l'œuvre {artworks.length > 1 ? `#${index + 1}` : ''}
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <Input
                  id={`artwork-name-${index}`}
                  value={artwork.name}
                  onChange={(e) => handleUpdateArtwork(index, 'name', e.target.value)}
                  placeholder="Ex: La Joconde"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor={`artwork-file-${index}`}>
                  Fichier PDF de l'œuvre
                </Label>
                
                {/* Affichage du PDF existant */}
                {artwork.pdfPath && !uploadingIndex && (
                  <div className="mt-2 mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-green-800">
                            {artwork.pdfPath.split('/').pop()}
                          </span>
                          <span className="text-xs text-green-600">PDF uploadé</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(artwork.pdfPath, '_blank')}
                          className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Voir
                        </button>
                        <label
                          htmlFor={`artwork-file-${index}`}
                          className="px-3 py-1 text-xs font-medium text-orange-700 bg-orange-50 rounded hover:bg-orange-100 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          Modifier
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Input file caché si PDF existe déjà */}
                <input
                  id={`artwork-file-${index}`}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => handleFileChange(index, e.target.files?.[0] || null)}
                  disabled={uploadingIndex === index}
                  className={`${artwork.pdfPath ? 'hidden' : 'mt-1 block w-full'} text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                />
                
                {/* Message d'upload en cours */}
                {uploadingIndex === index && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm text-blue-700 font-medium">Upload en cours...</span>
                  </div>
                )}

                {/* Message si pas de PDF */}
                {!artwork.pdfPath && !uploadingIndex && (
                  <p className="mt-2 text-xs text-gray-500">
                    Sélectionnez un fichier PDF pour cette œuvre
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={handleAddArtwork}
          variant="outline"
          className="w-full mb-4"
        >
          + Ajouter une autre œuvre à cet emplacement
        </Button>

        <div className="flex gap-3">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {existingArtworks.length > 0 ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
