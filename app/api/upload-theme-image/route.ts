import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

/**
 * POST /api/upload-theme-image
 * Upload d'une image pour les thématiques (centres d'intérêts et mouvements)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Aucun fichier fourni' },
        { status: 400 }
      )
    }

    // Validation du type de fichier
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Type de fichier non supporté. Utilisez JPG, PNG, GIF ou WebP.' },
        { status: 400 }
      )
    }

    // Validation de la taille (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'Le fichier est trop volumineux. Taille maximum: 5MB.' },
        { status: 400 }
      )
    }

    // Créer le dossier de destination si nécessaire
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'themes')
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true })
    }

    // Générer un nom de fichier unique
    const fileExtension = path.extname(file.name)
    const fileName = `theme_${randomUUID()}${fileExtension}`
    const filePath = path.join(uploadDir, fileName)

    // Convertir le fichier en buffer et sauvegarder
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Retourner l'URL publique du fichier
    const imageUrl = `/uploads/themes/${fileName}`

    return NextResponse.json({
      success: true,
      imageUrl,
      fileName,
      size: file.size,
      type: file.type
    })
  } catch (error) {
    console.error('Erreur lors de l\'upload de l\'image:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur lors de l\'upload' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/upload-theme-image
 * Suppression d'une image de thématique
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get('imageUrl')

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: 'URL de l\'image non fournie' },
        { status: 400 }
      )
    }

    // Extraire le nom du fichier depuis l'URL
    const fileName = path.basename(imageUrl)
    
    // Vérifier que le fichier est bien dans le dossier themes
    if (!imageUrl.startsWith('/uploads/themes/')) {
      return NextResponse.json(
        { success: false, error: 'URL invalide' },
        { status: 400 }
      )
    }

    const filePath = path.join(process.cwd(), 'public', 'uploads', 'themes', fileName)

    // Vérifier si le fichier existe
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Fichier non trouvé' },
        { status: 404 }
      )
    }

    // Supprimer le fichier
    const { unlink } = await import('fs/promises')
    await unlink(filePath)

    return NextResponse.json({
      success: true,
      message: 'Image supprimée avec succès'
    })
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'image:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur lors de la suppression' },
      { status: 500 }
    )
  }
}
