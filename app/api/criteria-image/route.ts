import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * POST - Upload ou mise à jour d'une image pour un critère
 * Gère automatiquement la suppression de l'ancienne image
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const criteriaId = formData.get('criteriaId') as string
    const imageFile = formData.get('imageFile') as File | null
    const oldImagePath = formData.get('oldImagePath') as string | null
    
    if (!criteriaId) {
      return NextResponse.json({ error: 'ID du critère manquant' }, { status: 400 })
    }

    // Supprimer l'ancienne image si existante
    if (oldImagePath && oldImagePath !== '/placeholder.svg') {
      const oldFullPath = path.join(process.cwd(), 'public', oldImagePath.replace(/^\//, ''))
      try {
        await fs.unlink(oldFullPath)
        console.log(`✅ Ancienne image supprimée: ${oldImagePath}`)
      } catch (error) {
        console.warn(`⚠️ Impossible de supprimer l'ancienne image: ${oldImagePath}`, error)
      }
    }

    // Si pas de nouveau fichier, retourner placeholder
    if (!imageFile) {
      return NextResponse.json({ 
        success: true, 
        message: 'Image supprimée',
        imagePath: '/placeholder.svg'
      })
    }

    // Valider le fichier
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json({ 
        error: 'Le fichier doit être une image (jpg, png, webp, gif)' 
      }, { status: 400 })
    }

    // Taille max 10MB
    if (imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ 
        error: 'L\'image ne doit pas dépasser 10MB' 
      }, { status: 400 })
    }

    // Générer nom de fichier unique
    const timestamp = Date.now()
    const cleanCriteriaId = criteriaId.replace(/[^a-zA-Z0-9]/g, '_')
    const ext = imageFile.name.split('.').pop() || 'jpg'
    const fileName = `criteria_${cleanCriteriaId}_${timestamp}.${ext}`
    const relativePath = `/uploads/criterias/${fileName}`
    const fullPath = path.join(process.cwd(), 'public', 'uploads', 'criterias', fileName)
    
    try {
      // Lire le fichier
      const bytes = await imageFile.arrayBuffer()
      const buffer = Buffer.from(bytes)
      
      // Créer le dossier si nécessaire
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      
      // Écrire le fichier
      await fs.writeFile(fullPath, new Uint8Array(buffer))
      console.log(`✅ Image sauvegardée: ${fileName} (${imageFile.size} bytes)`)
      
      return NextResponse.json({ 
        success: true, 
        message: 'Image uploadée avec succès',
        imagePath: relativePath,
        fileName,
        size: imageFile.size
      })
      
    } catch (writeError) {
      console.error('Erreur écriture fichier:', writeError)
      return NextResponse.json({ 
        error: 'Erreur lors de la sauvegarde de l\'image',
        details: writeError instanceof Error ? writeError.message : 'Erreur inconnue'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Erreur POST criteria-image:', error)
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}

/**
 * DELETE - Supprimer une image de critère
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const imagePath = searchParams.get('imagePath')

    if (!imagePath || imagePath === '/placeholder.svg') {
      return NextResponse.json({ 
        success: true, 
        message: 'Aucune image à supprimer' 
      })
    }

    const fullPath = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''))
    
    try {
      await fs.unlink(fullPath)
      console.log(`✅ Image supprimée: ${imagePath}`)
      return NextResponse.json({ 
        success: true, 
        message: 'Image supprimée avec succès' 
      })
    } catch (error) {
      console.warn(`⚠️ Impossible de supprimer l'image: ${imagePath}`, error)
      return NextResponse.json({ 
        success: true, 
        message: 'Image déjà supprimée ou inexistante' 
      })
    }

  } catch (error) {
    console.error('Erreur DELETE criteria-image:', error)
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}
