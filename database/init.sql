-- ===============================
-- MUSEUM VOICE - DATABASE SCHEMA
-- PostgreSQL 16
-- ===============================

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
    token TEXT UNIQUE,
    created_by TEXT,
    is_used INTEGER DEFAULT 0,
    link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
-- TABLE : Artistes
-- ===============================
CREATE TABLE IF NOT EXISTS artistes (
    artiste_id SERIAL PRIMARY KEY,
    nom TEXT NOT NULL,
    lieu_naissance TEXT,
    date_naissance TEXT,
    date_deces TEXT,
    biographie TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- TABLE : Mouvements Artistiques
-- ===============================
CREATE TABLE IF NOT EXISTS mouvements (
    mouvement_id SERIAL PRIMARY KEY,
    nom TEXT NOT NULL UNIQUE,
    description TEXT,
    periode_debut TEXT,
    periode_fin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- TABLE : Oeuvres (ENRICHIE)
-- ===============================
CREATE TABLE IF NOT EXISTS oeuvres (
    oeuvre_id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    artiste_id INTEGER REFERENCES artistes(artiste_id) ON DELETE SET NULL,
    mouvement_id INTEGER REFERENCES mouvements(mouvement_id) ON DELETE SET NULL,
    description TEXT,
    date_oeuvre TEXT,
    materiaux_technique TEXT,
    dimensions TEXT,
    provenance TEXT,
    contexte_commande TEXT,
    analyse_materielle_technique TEXT,
    iconographie_symbolique TEXT,
    reception_circulation_posterite TEXT,
    parcours_conservation_doc TEXT,
    localisation_salle TEXT,
    position TEXT,
    image_link TEXT,
    pdf_link TEXT,
    file_name TEXT,
    file_path TEXT,
    room INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
-- TABLE : Relations
-- ===============================
CREATE TABLE IF NOT EXISTS relations (
    relation_id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    cible_id INTEGER NOT NULL,
    type_relation TEXT NOT NULL,

    CONSTRAINT fk_relations_source
        FOREIGN KEY (source_id)
        REFERENCES entities(entity_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_relations_cible
        FOREIGN KEY (cible_id)
        REFERENCES entities(entity_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Chunk
-- ===============================
-- TABLE : Chunk
-- ===============================
CREATE TABLE IF NOT EXISTS chunk (
    chunk_id SERIAL PRIMARY KEY,
    chunk_text TEXT,
    chunk_index INTEGER DEFAULT 0,
    oeuvre_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chunk_oeuvre
        FOREIGN KEY (oeuvre_id)
        REFERENCES oeuvres(oeuvre_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Embeddings (Pour RAG)
-- ===============================
CREATE TABLE IF NOT EXISTS embeddings (
    embedding_id SERIAL PRIMARY KEY,
    chunk_id INTEGER NOT NULL REFERENCES chunk(chunk_id) ON DELETE CASCADE,
    embedding_vector BYTEA NOT NULL,
    model_name TEXT NOT NULL,
    vector_dimension INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chunk_id, model_name)
);

-- ===============================
-- TABLE : Sections Documentaires
-- ===============================
CREATE TABLE IF NOT EXISTS sections (
    section_id SERIAL PRIMARY KEY,
    oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE,
    type_section TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    ordre INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- TABLE : Anecdotes
-- ===============================
CREATE TABLE IF NOT EXISTS anecdotes (
    anecdote_id SERIAL PRIMARY KEY,
    oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- TABLE : Pregenerations (COMPLÈTE)
-- ===============================
CREATE TABLE IF NOT EXISTS pregenerations (
    pregeneration_id SERIAL PRIMARY KEY,
    oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE,
    age_cible TEXT NOT NULL CHECK (age_cible IN ('enfant', 'ado', 'adulte', 'senior')),
    thematique TEXT NOT NULL CHECK (thematique IN ('technique_picturale', 'biographie', 'historique')),
    style_texte TEXT NOT NULL CHECK (style_texte IN ('analyse', 'decouverte', 'anecdote')),
    pregeneration_text TEXT NOT NULL,
    voice_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(oeuvre_id, age_cible, thematique, style_texte)
);

-- ===============================
-- TABLE : Criterias
-- ===============================
CREATE TABLE IF NOT EXISTS criterias (
    criteria_id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_link TEXT
);

-- ===============================
-- TABLE : Oeuvre_Criterias (Jointure)
-- ===============================
CREATE TABLE IF NOT EXISTS oeuvre_criterias (
    oeuvre_id INTEGER NOT NULL,
    criteria_id INTEGER NOT NULL,
    PRIMARY KEY (oeuvre_id, criteria_id),

    CONSTRAINT fk_oeuvre_criterias_oeuvre
        FOREIGN KEY (oeuvre_id)
        REFERENCES oeuvres(oeuvre_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_oeuvre_criterias_criteria
        FOREIGN KEY (criteria_id)
        REFERENCES criterias(criteria_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- TABLE : Generated_Guide
-- ===============================
CREATE TABLE IF NOT EXISTS generated_guide (
    generated_guide_id SERIAL PRIMARY KEY
);

-- ===============================
-- TABLE : Criterias_Guide (Jointure)
-- ===============================
CREATE TABLE IF NOT EXISTS criterias_guide (
    generated_guide_id INTEGER NOT NULL,
    criteria_id INTEGER NOT NULL,
    PRIMARY KEY (generated_guide_id, criteria_id),

    CONSTRAINT fk_criterias_guide_guide
        FOREIGN KEY (generated_guide_id)
        REFERENCES generated_guide(generated_guide_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_criterias_guide_criteria
        FOREIGN KEY (criteria_id)
        REFERENCES criterias(criteria_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
CREATE INDEX IF NOT EXISTS idx_oeuvres_artiste ON oeuvres(artiste_id);
CREATE INDEX IF NOT EXISTS idx_oeuvres_mouvement ON oeuvres(mouvement_id);
CREATE INDEX IF NOT EXISTS idx_pregenerations_oeuvre ON pregenerations(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_pregenerations_criteres ON pregenerations(age_cible, thematique, style_texte);
CREATE INDEX IF NOT EXISTS idx_sections_oeuvre ON sections(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_anecdotes_oeuvre ON anecdotes(oeuvre_id);

-- Indexes pour RAG (chunks et embeddings)
CREATE INDEX IF NOT EXISTS idx_chunk_oeuvre ON chunk(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id);
-- TABLE : Criterias_Pregeneration (Jointure)
-- ===============================
CREATE TABLE IF NOT EXISTS criterias_pregeneration (
    pregeneration_id INTEGER NOT NULL,
    criteria_id INTEGER NOT NULL,
    PRIMARY KEY (pregeneration_id, criteria_id),

    CONSTRAINT fk_criterias_pregeneration_pregen
        FOREIGN KEY (pregeneration_id)
        REFERENCES pregenerations(pregeneration_id)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_criterias_pregeneration_criteria
        FOREIGN KEY (criteria_id)
        REFERENCES criterias(criteria_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ===============================
-- INDEX POUR PERFORMANCES
-- ===============================
CREATE INDEX IF NOT EXISTS idx_entities_plan_id ON entities(plan_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_points_entity_id ON points(entity_id);
CREATE INDEX IF NOT EXISTS idx_chunk_oeuvre_id ON chunk(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_cible ON relations(cible_id);

-- ===============================
-- DONNÉES PAR DÉFAUT
-- ===============================
INSERT INTO stats (stats_id) VALUES (1) ON CONFLICT DO NOTHING;

-- ===============================
-- FIN DU SCHÉMA
-- ===============================
