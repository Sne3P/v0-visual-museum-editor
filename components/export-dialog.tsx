"use client"

import { useState } from "react"
import type { EditorState } from "@/lib/types"

interface ExportDialogProps {
  state: EditorState
  onClose: () => void
}

export function ExportDialog({ state, onClose }: ExportDialogProps) {
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [exportFormat, setExportFormat] = useState<'json' | 'sql' | 'both'>('json')

  // Génération d'IDs séquentiels pour les différentes entités
  let entityIdCounter = 1
  let pointIdCounter = 1
  let relationIdCounter = 1
  let oeuvreIdCounter = 1
  let chunkIdCounter = 1
  let criteriaIdCounter = 1

  // =========
  // BLOC "PLAN / ÉDITEUR DE PLAN"
  // =========

  // 1. Plans
  const plans = state.floors.map((floor, index) => ({
    plan_id: index + 1,
    nom: floor.name || `Plan ${index + 1}`,
    description: `Plan de niveau ${floor.name}`,
    date_creation: new Date().toISOString().split('T')[0]
  }))

  // 2. Entities + 3. Points (traitement simultané)
  const entities: any[] = []
  const points: any[] = []
  const relations: any[] = []

  state.floors.forEach((floor, floorIndex) => {
    const planId = floorIndex + 1

    // Entités ROOM (salles)
    floor.rooms.forEach((room) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Salle ${room.id}`,
        entity_type: 'ROOM',
        description: `Salle identifiée par ${room.id}`,
        oeuvre_id: null
      })

      // Points définissant le polygone de la salle
      room.polygon.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
    })

    // Entités ARTWORK (œuvres)
    floor.artworks.forEach((artwork) => {
      const entityId = entityIdCounter++
      const oeuvreId = oeuvreIdCounter++
      
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: artwork.name || `Œuvre ${artwork.id}`,
        entity_type: 'ARTWORK',
        description: `Œuvre positionnée sur le plan`,
        oeuvre_id: oeuvreId
      })

      // Position de l'œuvre (point unique ou rectangle si size défini)
      if (artwork.size) {
        // Rectangle défini par 4 points
        const [x, y] = artwork.xy
        const [width, height] = artwork.size
        const rectanglePoints = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height }
        ]
        rectanglePoints.forEach((point, index) => {
          points.push({
            point_id: pointIdCounter++,
            entity_id: entityId,
            x: point.x,
            y: point.y,
            ordre: index + 1
          })
        })
      } else {
        // Point unique
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: artwork.xy[0],
          y: artwork.xy[1],
          ordre: 1
        })
      }
    })

    // Entités DOOR (portes)
    floor.doors.forEach((door) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Porte ${door.id}`,
        entity_type: 'DOOR',
        description: `Porte entre ${door.room_a} et ${door.room_b}`,
        oeuvre_id: null
      })

      // Points définissant le segment de la porte
      door.segment.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })

      // Relation porte -> salles
      const roomAEntity = entities.find(e => 
        e.plan_id === planId && e.entity_type === 'ROOM' && e.name === `Salle ${door.room_a}`
      )
      const roomBEntity = entities.find(e => 
        e.plan_id === planId && e.entity_type === 'ROOM' && e.name === `Salle ${door.room_b}`
      )

      if (roomAEntity) {
        relations.push({
          relation_id: relationIdCounter++,
          source_id: entityId,
          cible_id: roomAEntity.entity_id,
          type_relation: 'CONNECTS_TO'
        })
      }
      if (roomBEntity) {
        relations.push({
          relation_id: relationIdCounter++,
          source_id: entityId,
          cible_id: roomBEntity.entity_id,
          type_relation: 'CONNECTS_TO'
        })
      }
    })

    // Entités VERTICAL_LINK (escaliers, ascenseurs)
    floor.verticalLinks.forEach((link) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `${link.type === 'stairs' ? 'Escalier' : 'Ascenseur'} ${link.id}`,
        entity_type: 'VERTICAL_LINK',
        description: `Liaison verticale vers étage ${link.to_floor}`,
        oeuvre_id: null
      })

      // Points définissant le segment
      link.segment.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
    })

    // Entités WALL (murs)
    floor.walls.forEach((wall) => {
      const entityId = entityIdCounter++
      entities.push({
        entity_id: entityId,
        plan_id: planId,
        name: `Mur ${wall.id}`,
        entity_type: 'WALL',
        description: `Mur ${wall.isLoadBearing ? 'porteur' : 'cloison'}`,
        oeuvre_id: null
      })

      // Points définissant le segment du mur
      wall.segment.forEach((point, index) => {
        points.push({
          point_id: pointIdCounter++,
          entity_id: entityId,
          x: point.x,
          y: point.y,
          ordre: index + 1
        })
      })
    })
  })

  // =========
  // BLOC "ŒUVRES & CONTENUS"
  // =========

  // Collecte des PDF temporaires
  const tempPdfs: Array<{ filename: string; base64: string }> = []
  
  // 4. Oeuvres (données enrichies)
  const oeuvres = state.floors.flatMap((floor, floorIndex) => 
    floor.artworks.map((artwork, artworkIndex) => {
      // Si l'artwork a un PDF temporaire, l'ajouter à la liste et générer le nom de fichier
      let finalPdfLink = artwork.pdfLink
      
      if (artwork.tempPdfFile && artwork.tempPdfBase64) {
        const fileName = `artwork_${artwork.id}_${Date.now()}.pdf`
        tempPdfs.push({
          filename: fileName,
          base64: artwork.tempPdfBase64
        })
        finalPdfLink = `/uploads/pdfs/${fileName}`
      }
      
      return {
        oeuvre_id: artworkIndex + 1 + floorIndex * 1000, // ID unique
        title: artwork.name || `Œuvre ${artwork.id}`,
        artist: "Artiste inconnu", // À enrichir selon vos données
        description: `Œuvre exposée dans la salle`,
        image_link: artwork.pdf_id ? `/images/${artwork.pdf_id}.jpg` : null,
        pdf_link: finalPdfLink, // Utiliser le lien final (temporaire ou existant)
        room: parseInt(artwork.id.split('_')[1] || '1') // Extraction approximative du numéro de salle
      }
    })
  )

  // 5. Chunk (textes liés aux œuvres)
  const chunks = oeuvres.flatMap((oeuvre) => [
    {
      chunk_id: chunkIdCounter++,
      chunk_text: `Introduction à ${oeuvre.title}`,
      oeuvre_id: oeuvre.oeuvre_id
    },
    {
      chunk_id: chunkIdCounter++,
      chunk_text: `Contexte historique de ${oeuvre.title}`,
      oeuvre_id: oeuvre.oeuvre_id
    },
    {
      chunk_id: chunkIdCounter++,
      chunk_text: `Analyse technique de ${oeuvre.title}`,
      oeuvre_id: oeuvre.oeuvre_id
    }
  ])

  // 6. Pregeneration (contenus pré-générés)
  const pregenerations = oeuvres.map((oeuvre) => ({
    pregeneration_id: oeuvre.oeuvre_id,
    oeuvre_id: oeuvre.oeuvre_id,
    voice_link: `/audio/oeuvre_${oeuvre.oeuvre_id}_voice.mp3`
  }))

  // =========
  // BLOC "CRITÈRES & GUIDES"
  // =========

  // 7. Criterias (critères de filtrage/tags)
  const criterias = [
    {
      criteria_id: criteriaIdCounter++,
      type: 'THEME',
      name: 'Art contemporain',
      description: 'Œuvres d\'art contemporain',
      image_link: '/icons/contemporary.png'
    },
    {
      criteria_id: criteriaIdCounter++,
      type: 'DURATION',
      name: 'Visite courte (14min)',
      description: 'Parcours rapide',
      image_link: '/icons/quick.png'
    },
    {
      criteria_id: criteriaIdCounter++,
      type: 'ACCESSIBILITY',
      name: 'Accessible PMR',
      description: 'Accessible aux personnes à mobilité réduite',
      image_link: '/icons/accessible.png'
    },
    {
      criteria_id: criteriaIdCounter++,
      type: 'LEVEL',
      name: 'Niveau débutant',
      description: 'Adapté aux débutants',
      image_link: '/icons/beginner.png'
    }
  ]

  // 8. Tables de jointure et guides (exemples)
  const oeuvre_criterias = oeuvres.flatMap((oeuvre, index) => 
    criterias.slice(0, 2 + (index % 2)).map((criteria) => ({
      oeuvre_id: oeuvre.oeuvre_id,
      criteria_id: criteria.criteria_id
    }))
  )

  const generated_guides = [
    { generated_guide_id: 1 },
    { generated_guide_id: 2 }
  ]

  const criterias_guide = [
    { generated_guide_id: 1, criteria_id: 1 },
    { generated_guide_id: 1, criteria_id: 2 },
    { generated_guide_id: 2, criteria_id: 3 },
    { generated_guide_id: 2, criteria_id: 4 }
  ]

  const criterias_pregeneration = pregenerations.flatMap((pregen) => 
    criterias.slice(0, 2).map((criteria) => ({
      pregeneration_id: pregen.pregeneration_id,
      criteria_id: criteria.criteria_id
    }))
  )

  // =========
  // BLOC "DIVERS"
  // =========

  const stats = [
    { stats_id: 1 },
    { stats_id: 2 }
  ]

  const qr_codes = plans.map((plan, index) => ({
    qr_code_id: index + 1,
    link: `https://museum-app.com/plan/${plan.plan_id}`
  }))

  // Structure finale de l'export
  const exportData = {
    metadata: {
      export_date: new Date().toISOString(),
      museum_id: "MUS_001",
      grid_size_m: state.gridSize,
      total_floors: state.floors.length,
      format_version: "2.0-DB-Ready"
    },

    // BLOC PLAN / ÉDITEUR
    plan_editor: {
      plans,
      entities,
      points,
      relations
    },

    // BLOC ŒUVRES & CONTENUS  
    oeuvres_contenus: {
      oeuvres,
      chunks,
      pregenerations
    },

    // PDF temporaires à sauvegarder
    temp_pdfs: tempPdfs,

    // BLOC CRITÈRES & GUIDES
    criterias_guides: {
      criterias,
      oeuvre_criterias,
      generated_guides,
      criterias_guide,
      criterias_pregeneration
    },

    // BLOC DIVERS
    divers: {
      stats,
      qr_codes
    },

    // Données originales (pour compatibilité)
    legacy_format: {
      floors: state.floors.map((floor) => ({
        id: floor.id,
        name: floor.name,
        rooms: floor.rooms.map((room) => ({
          id: room.id,
          polygon: room.polygon.map((p) => [p.x, p.y]),
        })),
        doors: floor.doors.map((door) => ({
          id: door.id,
          room_a: door.room_a,
          room_b: door.room_b,
          segment: door.segment,
        })),
        artworks: floor.artworks.map((artwork) => ({
          id: artwork.id,
          xy: artwork.xy,
          size: artwork.size,
          name: artwork.name,
          pdf_id: artwork.pdf_id,
        })),
        vertical_links: floor.verticalLinks.map((link) => ({
          id: link.id,
          type: link.type,
          segment: link.segment,
          to_floor: link.to_floor,
        })),
        walls: floor.walls.map((wall) => ({
          id: wall.id,
          segment: wall.segment,
          thickness: wall.thickness,
          isLoadBearing: wall.isLoadBearing,
        })),
      }))
    }
  }

  // Génération du SQL complet
  const generateSQL = () => {
    const sqlStructure = `-- =========
-- STRUCTURE DE BASE (PLANS / ÉDITEUR DE PLAN)
-- =========

CREATE TABLE plans (
    plan_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom            TEXT    NOT NULL,
    description    TEXT,
    date_creation  DATE
);

CREATE TABLE entities (
    entity_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id     INTEGER REFERENCES plans(plan_id),
    name        TEXT,
    entity_type TEXT    NOT NULL,
    description TEXT,
    oeuvre_id   INTEGER REFERENCES oeuvres(oeuvre_id)
);

CREATE TABLE points (
    point_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(entity_id),
    x         REAL    NOT NULL,
    y         REAL    NOT NULL,
    ordre     INTEGER NOT NULL
);

CREATE TABLE relations (
    relation_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id    INTEGER NOT NULL REFERENCES entities(entity_id),
    cible_id     INTEGER NOT NULL REFERENCES entities(entity_id),
    type_relation TEXT  NOT NULL
);

-- =========
-- OEUVRES & CONTENUS
-- =========

CREATE TABLE oeuvres (
    oeuvre_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT    NOT NULL,
    artist      TEXT    NOT NULL,
    description TEXT,
    image_link  TEXT,
    pdf_link    TEXT,
    room        INTEGER NOT NULL
);

CREATE TABLE chunk (
    chunk_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chunk_text TEXT,
    oeuvre_id  INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id)
);

CREATE TABLE pregeneration (
    pregeneration_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    oeuvre_id        INTEGER REFERENCES oeuvres(oeuvre_id),
    voice_link       TEXT
);

-- =========
-- CRITERES & GUIDES
-- =========

CREATE TABLE criterias (
    criteria_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type         TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    image_link   TEXT
);

CREATE TABLE oeuvre_criterias (
    oeuvre_id   INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id),
    criteria_id INTEGER NOT NULL REFERENCES criterias(criteria_id),
    PRIMARY KEY (oeuvre_id, criteria_id)
);

CREATE TABLE generated_guide (
    generated_guide_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE criterias_guide (
    generated_guide_id INTEGER NOT NULL REFERENCES generated_guide(generated_guide_id),
    criteria_id        INTEGER NOT NULL REFERENCES criterias(criteria_id),
    PRIMARY KEY (generated_guide_id, criteria_id)
);

CREATE TABLE criterias_pregeneration (
    pregeneration_id INTEGER NOT NULL REFERENCES pregeneration(pregeneration_id),
    criteria_id      INTEGER NOT NULL REFERENCES criterias(criteria_id),
    PRIMARY KEY (pregeneration_id, criteria_id)
);

-- =========
-- STATS & QR CODES
-- =========

CREATE TABLE stats (
    stats_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE qr_code (
    qr_code_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    link       TEXT
);

-- =========
-- DONNÉES D'INSERTION
-- =========
`

    const sqlInserts = [
      // Plans
      ...exportData.plan_editor.plans.map(plan => 
        `INSERT INTO plans (plan_id, nom, description, date_creation) VALUES (${plan.plan_id}, '${plan.nom}', '${plan.description}', '${plan.date_creation}');`
      ),
      
      // Entities  
      ...exportData.plan_editor.entities.map(entity =>
        `INSERT INTO entities (entity_id, plan_id, name, entity_type, description, oeuvre_id) VALUES (${entity.entity_id}, ${entity.plan_id}, '${entity.name}', '${entity.entity_type}', '${entity.description}', ${entity.oeuvre_id || 'NULL'});`
      ),
      
      // Points
      ...exportData.plan_editor.points.map(point =>
        `INSERT INTO points (point_id, entity_id, x, y, ordre) VALUES (${point.point_id}, ${point.entity_id}, ${point.x}, ${point.y}, ${point.ordre});`
      ),

      // Relations
      ...exportData.plan_editor.relations.map(relation =>
        `INSERT INTO relations (relation_id, source_id, cible_id, type_relation) VALUES (${relation.relation_id}, ${relation.source_id}, ${relation.cible_id}, '${relation.type_relation}');`
      ),

      // Oeuvres
      ...exportData.oeuvres_contenus.oeuvres.map(oeuvre =>
        `INSERT INTO oeuvres (oeuvre_id, title, artist, description, image_link, pdf_link, room) VALUES (${oeuvre.oeuvre_id}, '${oeuvre.title}', '${oeuvre.artist}', '${oeuvre.description || ''}', ${oeuvre.image_link ? `'${oeuvre.image_link}'` : 'NULL'}, ${oeuvre.pdf_link ? `'${oeuvre.pdf_link}'` : 'NULL'}, ${oeuvre.room});`
      ),

      // Chunks
      ...exportData.oeuvres_contenus.chunks.map(chunk =>
        `INSERT INTO chunk (chunk_id, chunk_text, oeuvre_id) VALUES (${chunk.chunk_id}, '${chunk.chunk_text}', ${chunk.oeuvre_id});`
      ),

      // Criterias
      ...exportData.criterias_guides.criterias.map(criteria =>
        `INSERT INTO criterias (criteria_id, type, name, description, image_link) VALUES (${criteria.criteria_id}, '${criteria.type}', '${criteria.name}', '${criteria.description}', '${criteria.image_link}');`
      )
    ].join('\n')

    return sqlStructure + '\n\n' + sqlInserts
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const sqlString = generateSQL()

  const getExportContent = () => {
    switch (exportFormat) {
      case 'json': return jsonString
      case 'sql': return sqlString  
      case 'both': return `-- STRUCTURE ET DONNÉES SQL\n${sqlString}\n\n-- DONNÉES JSON COMPLÉMENTAIRES\n/*\n${jsonString}\n*/`
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(getExportContent())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const content = getExportContent()
    const mimeType = exportFormat === 'json' ? 'application/json' : 'text/sql'
    const extension = exportFormat === 'json' ? 'json' : 'sql'
    const filename = exportFormat === 'both' ? 'museum-complete.sql' : `museum-export.${extension}`
    
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveToDatabase = async () => {
    setSaving(true)
    setSaveSuccess(false)
    
    try {
      const response = await fetch('/api/save-to-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exportData: exportData
        }),
      })

      const result = await response.json()
      
      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        
        // Afficher le résumé des données insérées
        if (result.inserted) {
          const summary = Object.entries(result.inserted)
            .map(([key, count]) => `${count} ${key}`)
            .join(', ')
          console.log(`✅ Données insérées: ${summary}`)
        }
      } else {
        console.error('Erreur lors de la sauvegarde:', result.error)
        alert(`Erreur PostgreSQL: ${result.error}\n\nDétails: ${result.details || ''}`)
      }
    } catch (error) {
      console.error('Erreur réseau:', error)
      alert('Erreur de connexion lors de la sauvegarde dans PostgreSQL')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Export Plan Musée - Format DB</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Format d'export :</label>
          <div className="flex gap-2">
            <button
              onClick={() => setExportFormat('json')}
              className={`rounded px-3 py-1 text-sm ${
                exportFormat === 'json' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'border border-border bg-background hover:bg-muted'
              }`}
            >
              JSON (Données)
            </button>
            <button
              onClick={() => setExportFormat('sql')}
              className={`rounded px-3 py-1 text-sm ${
                exportFormat === 'sql' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'border border-border bg-background hover:bg-muted'
              }`}
            >
              SQL (Structure + Données)
            </button>
            <button
              onClick={() => setExportFormat('both')}
              className={`rounded px-3 py-1 text-sm ${
                exportFormat === 'both' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'border border-border bg-background hover:bg-muted'
              }`}
            >
              Complet (SQL + JSON)
            </button>
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-sm text-muted-foreground">
            {exportFormat === 'json' && 'Données structurées pour insertion en base'}
            {exportFormat === 'sql' && 'Script SQL complet (CREATE TABLE + INSERT)'}  
            {exportFormat === 'both' && 'Script SQL avec JSON en commentaire'}
          </div>
        </div>

        <pre className="mb-4 max-h-96 overflow-auto rounded border border-border bg-muted p-4 text-xs">
          {getExportContent()}
        </pre>

        <div className="flex gap-2">
          <button
            onClick={handleSaveToDatabase}
            disabled={saving}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Sauvegarde PostgreSQL..." : saveSuccess ? "✅ Sauvegardé dans PostgreSQL!" : "💾 Sauvegarder dans PostgreSQL"}
          </button>
          <button
            onClick={handleCopy}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
          <button
            onClick={handleDownload}
            className="rounded border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Download JSON
          </button>
        </div>
      </div>
    </div>
  )
}
