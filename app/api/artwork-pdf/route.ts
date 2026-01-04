import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * POST - Upload ou mise à jour d'un PDF pour une œuvre
 * Gère automatiquement la suppression de l'ancien fichier
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const artworkId = formData.get('artworkId') as string
    const pdfFile = formData.get('pdfFile') as File | null
    const oldPdfPath = formData.get('oldPdfPath') as string | null
    
    if (!artworkId) {
      return NextResponse.json({ error: 'ID de l\'œuvre manquant' }, { status: 400 })
    }

    // Supprimer l'ancien PDF si existant
    if (oldPdfPath) {
      const oldFullPath = path.join(process.cwd(), 'public', oldPdfPath)
      try {
        await fs.unlink(oldFullPath)
        console.log(`✅ Ancien PDF supprimé: ${oldPdfPath}`)
      } catch (error) {
        console.warn(`⚠️ Impossible de supprimer l'ancien PDF: ${oldPdfPath}`, error)
      }
    }

    // Si pas de nouveau fichier, c'est une suppression
    if (!pdfFile) {
      return NextResponse.json({ 
        success: true, 
        message: 'PDF supprimé avec succès',
        pdfPath: null
      })
    }

    // Valider le fichier
    if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ 
        error: 'Le fichier doit être un PDF' 
      }, { status: 400 })
    }

    // Générer nom de fichier unique
    const timestamp = Date.now()
    const cleanArtworkId = artworkId.replace(/[^a-zA-Z0-9]/g, '_')
    const safeName = pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `artwork_${cleanArtworkId}_${timestamp}_${safeName}`
    const relativePath = `/uploads/pdfs/${fileName}`
    const fullPath = path.join(process.cwd(), 'public', relativePath)
    
    try {
      // Lire le fichier
      const bytes = await pdfFile.arrayBuffer()
      const buffer = Buffer.from(bytes)
      
      // Vérifier signature PDF
      const pdfHeader = buffer.subarray(0, 4).toString('ascii')
      if (!pdfHeader.startsWith('%PDF')) {
        console.error(`❌ Fichier invalide - En-tête: ${pdfHeader}`)
        throw new Error('Le fichier n\'est pas un PDF valide')
      }
      
      // Créer le dossier si nécessaire
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      
      // Écrire le fichier
      await fs.writeFile(fullPath, buffer)
      console.log(`✅ PDF sauvegardé: ${fileName} (${pdfFile.size} bytes)`)
      
      // Vérifier après sauvegarde
      const savedBuffer = await fs.readFile(fullPath)
      const savedHeader = savedBuffer.subarray(0, 4).toString('ascii')
      if (!savedHeader.startsWith('%PDF')) {
        await fs.unlink(fullPath)
        throw new Error('Corruption détectée après sauvegarde')
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'PDF uploadé avec succès',
        pdfPath: relativePath,
        fileName,
        size: pdfFile.size
      })
      
    } catch (writeError) {
      console.error('Erreur écriture fichier:', writeError)
      return NextResponse.json({ 
        error: 'Erreur lors de la sauvegarde du PDF',
        details: writeError instanceof Error ? writeError.message : 'Erreur inconnue'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Erreur POST artwork-pdf:', error)
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}

/**
 * DELETE - Suppression d'un PDF
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pdfPath = searchParams.get('pdfPath')
    
    if (!pdfPath) {
      return NextResponse.json({ error: 'Chemin PDF manquant' }, { status: 400 })
    }

    const fullPath = path.join(process.cwd(), 'public', pdfPath)
    
    try {
      await fs.unlink(fullPath)
      console.log(`✅ PDF supprimé: ${pdfPath}`)
      
      return NextResponse.json({ 
        success: true, 
        message: 'PDF supprimé avec succès'
      })
    } catch (unlinkError) {
      if ((unlinkError as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ 
          success: true, 
          message: 'PDF déjà supprimé ou inexistant'
        })
      }
      throw unlinkError
    }

  } catch (error) {
    console.error('Erreur DELETE artwork-pdf:', error)
    return NextResponse.json({ 
      error: 'Erreur lors de la suppression',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}