import { NextRequest, NextResponse } from 'next/server'
import { executeTransaction } from '@/lib/database'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const artworkId = formData.get('artworkId') as string
    const pdfFile = formData.get('pdfFile') as File
    const artworkTitle = formData.get('artworkTitle') as string
    
    if (!artworkId) {
      return NextResponse.json({ error: 'ID de l\'œuvre manquant' }, { status: 400 })
    }

    let pdfLink = ''
    
    if (pdfFile) {
      // Sauvegarder le fichier dans le dossier public/uploads/pdfs
      const timestamp = Date.now()
      // Nettoyer l'artworkId pour éviter la duplication du préfixe "artwork"
      const cleanArtworkId = artworkId.startsWith('artwork-') ? artworkId.substring(8) : artworkId
      const fileName = `artwork_${cleanArtworkId}_${timestamp}_${pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      pdfLink = `/uploads/pdfs/${fileName}`
      
      try {
        const bytes = await pdfFile.arrayBuffer()
        const buffer = Buffer.from(bytes)
        
        // Vérifier que le fichier commence bien par %PDF
        const pdfHeader = buffer.subarray(0, 4).toString('ascii')
        if (!pdfHeader.startsWith('%PDF')) {
          console.error(`❌ Fichier invalide - En-tête: ${pdfHeader}`)
          throw new Error('Le fichier uploadé n\'est pas un PDF valide')
        }
        
        // Écrire le fichier sur le disque
        const fs = require('fs')
        const path = require('path')
        const filePath = path.join(process.cwd(), 'public', 'uploads', 'pdfs', fileName)
        
        // Créer le dossier si il n'existe pas
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        
        fs.writeFileSync(filePath, buffer)
        console.log(`✅ PDF valide sauvegardé: ${fileName} (${pdfFile.size} bytes)`)
        
        // Vérifier après sauvegarde
        const savedBuffer = fs.readFileSync(filePath)
        const savedHeader = savedBuffer.subarray(0, 4).toString('ascii')
        if (!savedHeader.startsWith('%PDF')) {
          fs.unlinkSync(filePath) // Supprimer le fichier corrompu
          throw new Error('Corruption détectée après sauvegarde')
        }
        
      } catch (writeError) {
        console.error('Erreur lors de l\'écriture du fichier:', writeError)
        throw new Error(`Erreur lors de la sauvegarde du fichier PDF: ${writeError.message}`)
      }
    }

    // Note: Pour l'instant, nous ne mettons pas à jour la base de données directement
    // car les œuvres n'existent en BDD qu'après un export complet.
    // Le PDF et le titre seront sauvegardés dans l'état local de l'application et inclus lors de l'export.
    console.log(`PDF associé à l'œuvre "${artworkTitle}" (${artworkId}): ${pdfLink}`)

    return NextResponse.json({ 
      success: true, 
      message: pdfFile ? 'PDF et titre uploadés avec succès' : 'PDF supprimé avec succès',
      pdfLink: pdfLink || null,
      artworkId,
      artworkTitle
    })

  } catch (error) {
    console.error('Erreur lors de la sauvegarde du PDF:', error)
    return NextResponse.json({ 
      error: 'Erreur lors de la sauvegarde du PDF',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const artworkId = searchParams.get('artworkId')
    
    if (!artworkId) {
      return NextResponse.json({ error: 'ID de l\'œuvre manquant' }, { status: 400 })
    }

    // Note: Pour l'instant, nous ne récupérons pas depuis la base de données
    // car les œuvres n'existent en BDD qu'après un export complet.
    // Les PDFs sont stockés dans l'état local de l'application.
    const pdfLink = null // Sera récupéré depuis l'état local

    return NextResponse.json({ 
      success: true, 
      pdfLink,
      artworkId
    })

  } catch (error) {
    console.error('Erreur lors de la récupération du PDF:', error)
    return NextResponse.json({ 
      error: 'Erreur lors de la récupération du PDF',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 })
  }
}