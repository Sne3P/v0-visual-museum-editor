-- ===============================
-- TABLE : Stats
-- ===============================
CREATE TABLE IF NOT EXISTS stats (
    stats_id SERIAL PRIMARY KEY
);

-- ===============================
-- TABLE : QR_code
-- ===============================
CREATE TABLE IF NOT EXISTS qr_code (
    qr_code_id SERIAL PRIMARY KEY,
    link TEXT
);

-- ===============================
-- TABLE : Plans
-- ===============================
CREATE TABLE IF NOT EXISTS plans (
    plan_id SERIAL PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT,
    date_creation DATE
);

-- ===============================
-- TABLE : Oeuvres
-- ===============================
CREATE TABLE IF NOT EXISTS oeuvres (
    oeuvre_id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    description TEXT,
    image_link TEXT,
    pdf_link TEXT,
    room INTEGER NOT NULL
);

-- ===============================
-- TABLE : Entities
-- ===============================
CREATE TABLE IF NOT EXISTS entities (
    entity_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL,
    name TEXT,
    entity_type TEXT NOT NULL,
    description TEXT,
    oeuvre_id INTEGER,

    CONSTRAINT fk_entities_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(plan_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_entities_oeuvre
        FOREIGN KEY (oeuvre_id)
        REFERENCES oeuvres(oeuvre_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Points
-- ===============================
CREATE TABLE IF NOT EXISTS points (
    point_id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    ordre INTEGER NOT NULL,

    CONSTRAINT fk_points_entity
        FOREIGN KEY (entity_id)
        REFERENCES entities(entity_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Chunk
-- ===============================
CREATE TABLE IF NOT EXISTS chunk (
    chunk_id SERIAL PRIMARY KEY,
    chunk_text TEXT,
    chunk_index INTEGER DEFAULT 0,
    oeuvre_id INTEGER NOT NULL,

    CONSTRAINT fk_chunk_oeuvre
        FOREIGN KEY (oeuvre_id)
        REFERENCES oeuvres(oeuvre_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Pregeneration
-- ===============================
CREATE TABLE IF NOT EXISTS pregeneration (
    pregeneration_id SERIAL PRIMARY KEY,
    oeuvre_id INTEGER NOT NULL,
    voice_link TEXT,

    CONSTRAINT fk_pregeneration_oeuvre
        FOREIGN KEY (oeuvre_id)
        REFERENCES oeuvres(oeuvre_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Criterias
-- ===============================
CREATE TABLE IF NOT EXISTS criterias (
    criterias_id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_link TEXT
);

-- ===============================
-- TABLE : Relations
-- ===============================
CREATE TABLE IF NOT EXISTS relations (
    relation_id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    cible_id INTEGER NOT NULL,
    type_relation TEXT NOT NULL,

    CONSTRAINT fk_relation_source
        FOREIGN KEY (source_id)
        REFERENCES entities(entity_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_relation_cible
        FOREIGN KEY (cible_id)
        REFERENCES entities(entity_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Oeuvre_Criterias
-- ===============================
CREATE TABLE IF NOT EXISTS oeuvre_criterias (
    oeuvre_id INTEGER NOT NULL,
    criterias_id INTEGER NOT NULL,

    PRIMARY KEY (oeuvre_id, criterias_id),

    CONSTRAINT fk_oeuvre_crit_oeuvre
        FOREIGN KEY (oeuvre_id)
        REFERENCES oeuvres(oeuvre_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_oeuvre_crit_criterias
        FOREIGN KEY (criterias_id)
        REFERENCES criterias(criterias_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Criterias_pregeneration
-- ===============================
CREATE TABLE IF NOT EXISTS criterias_pregeneration (
    pregeneration_id INTEGER NOT NULL,
    criterias_id INTEGER NOT NULL,

    PRIMARY KEY (pregeneration_id, criterias_id),

    CONSTRAINT fk_critpreg_pregen
        FOREIGN KEY (pregeneration_id)
        REFERENCES pregeneration(pregeneration_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_critpreg_crit
        FOREIGN KEY (criterias_id)
        REFERENCES criterias(criterias_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Generated_guide
-- ===============================
CREATE TABLE IF NOT EXISTS generated_guide (
    generated_guide_id SERIAL PRIMARY KEY
);

-- ===============================
-- TABLE : Criterias_guide
-- ===============================
CREATE TABLE IF NOT EXISTS criterias_guide (
    generated_guide_id INTEGER NOT NULL,
    criterias_id INTEGER NOT NULL,
    PRIMARY KEY (generated_guide_id, criterias_id),

    CONSTRAINT fk_critguide_guide
        FOREIGN KEY (generated_guide_id)
        REFERENCES generated_guide(generated_guide_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_critguide_crit
        FOREIGN KEY (criterias_id)
        REFERENCES criterias(criterias_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);


-- ===========================================
-- EXPORT DU PLAN - 11/12/2025 17:07:22
-- ===========================================

-- DONNÉES JSON EXPORTÉES
/*
{
  "metadata": {
    "export_date": "2025-12-11T16:06:58.916Z",
    "museum_id": "MUS_001",
    "grid_size_m": 1,
    "total_floors": 1,
    "format_version": "2.0-DB-Ready"
  },
  "plan_editor": {
    "plans": [
      {
        "plan_id": 1,
        "nom": "Ground Floor",
        "description": "Plan de niveau Ground Floor",
        "date_creation": "2025-12-11"
      }
    ],
    "entities": [],
    "points": [],
    "relations": []
  },
  "oeuvres_contenus": {
    "oeuvres": [],
    "chunks": [],
    "pregenerations": []
  },
  "criterias_guides": {
    "criterias": [
      {
        "criterias_id": 1,
        "type": "THEME",
        "name": "Art contemporain",
        "description": "Œuvres d'art contemporain",
        "image_link": "/icons/contemporary.png"
      },
      {
        "criterias_id": 2,
        "type": "DURATION",
        "name": "Visite courte (15min)",
        "description": "Parcours rapide",
        "image_link": "/icons/quick.png"
      },
      {
        "criterias_id": 3,
        "type": "ACCESSIBILITY",
        "name": "Accessible PMR",
        "description": "Accessible aux personnes à mobilité réduite",
        "image_link": "/icons/accessible.png"
      },
      {
        "criterias_id": 4,
        "type": "LEVEL",
        "name": "Niveau débutant",
        "description": "Adapté aux débutants",
        "image_link": "/icons/beginner.png"
      }
    ],
    "oeuvre_criterias": [],
    "generated_guides": [
      {
        "generated_guide_id": 1
      },
      {
        "generated_guide_id": 2
      }
    ],
    "criterias_guide": [
      {
        "generated_guide_id": 1,
        "criterias_id": 1
      },
      {
        "generated_guide_id": 1,
        "criterias_id": 2
      },
      {
        "generated_guide_id": 2,
        "criterias_id": 3
      },
      {
        "generated_guide_id": 2,
        "criterias_id": 4
      }
    ],
    "criterias_pregeneration": []
  },
  "divers": {
    "stats": [
      {
        "stats_id": 1
      },
      {
        "stats_id": 2
      }
    ],
    "qr_codes": [
      {
        "qr_code_id": 1,
        "link": "https://museum-app.com/plan/1"
      }
    ]
  },
  "legacy_format": {
    "floors": [
      {
        "id": "F1",
        "name": "Ground Floor",
        "rooms": [],
        "doors": [],
        "artworks": [],
        "vertical_links": [],
        "walls": []
      }
    ]
  }
}
*/