import { NextRequest, NextResponse } from 'next/server'
import { executeTransaction } from '@/lib/database'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const artworkId = formData.get('artworkId') as string
    const pdfFile = formData.get('pdfFile') as File
    
    if (!artworkId) {
      return NextResponse.json({ error: 'ID de l\'œuvre manquant' }, { status: 400 })
    }

    let pdfLink = ''
    
    if (pdfFile) {
      // Dans un vrai projet, vous uploaderiez le fichier vers un serveur de fichiers
      // Ici on simule en générant un lien
      const timestamp = Date.now()
      const fileName = `${artworkId}_${timestamp}_${pdfFile.name}`
      pdfLink = `/uploads/pdfs/${fileName}`
      
      // TODO: Implémenter l'upload réel du fichier
      // Par exemple, vers AWS S3, Google Cloud Storage, ou un serveur de fichiers
      console.log(`Simulation d'upload: ${fileName} (${pdfFile.size} bytes)`)
    }

    // Mettre à jour la base de données PostgreSQL
    const queries = [
      {
        text: `UPDATE oeuvres SET pdf_link = $1 WHERE oeuvre_id = (
          SELECT oeuvre_id FROM entities 
          WHERE entity_type = 'ARTWORK' 
          AND entities.entity_id = $2
          LIMIT 1
        )`,
        params: [pdfLink || null, artworkId]
      }
    ]

    await executeTransaction(queries)

    return NextResponse.json({ 
      success: true, 
      message: pdfFile ? 'PDF uploadé et assigné avec succès' : 'PDF supprimé avec succès',
      pdfLink: pdfLink || null,
      artworkId
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

    // Récupérer le PDF associé à l'œuvre depuis la base de données
    const queries = [
      {
        text: `SELECT o.pdf_link 
               FROM oeuvres o
               INNER JOIN entities e ON e.oeuvre_id = o.oeuvre_id
               WHERE e.entity_id = $1 AND e.entity_type = 'ARTWORK'
               LIMIT 1`,
        params: [artworkId]
      }
    ]

    const result = await executeTransaction(queries)
    const pdfLink = result.rows?.[0]?.pdf_link || null

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