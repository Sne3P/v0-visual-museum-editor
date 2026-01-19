-- ===============================
-- MUSEUM VOICE - DATABASE SCHEMA
-- PostgreSQL 16
-- ===============================
-- PostgreSQL 16 s'auto-optimise automatiquement selon les ressources disponibles
-- Aucune configuration manuelle requise

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
    parcours_id BIGINT,
    expires_at TIMESTAMP,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour nettoyage rapide des sessions expirées
CREATE INDEX IF NOT EXISTS idx_qr_code_expires_at ON qr_code(expires_at);

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
    anecdotes TEXT,
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
-- TABLES LEGACY RAG SUPPRIMÉES
-- (chunk, embeddings - système RAG non utilisé)
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
-- TABLE : Pregenerations (VRAIMENT DYNAMIQUE - N critères variables)
-- ===============================
CREATE TABLE IF NOT EXISTS pregenerations (
    pregeneration_id SERIAL PRIMARY KEY,
    oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE,
    criteria_combination JSONB NOT NULL,  -- {"age": 1, "thematique": 4, "style_texte": 7} - FLEXIBLE !
    pregeneration_text TEXT NOT NULL,
    voice_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(oeuvre_id, criteria_combination)  -- Combinaison unique par œuvre
);

-- Index pour recherche rapide par combinaison de critères
CREATE INDEX IF NOT EXISTS idx_pregenerations_criteria_combination 
    ON pregenerations USING GIN (criteria_combination);

-- ===============================
-- TABLE : Museum Settings (Paramètres globaux du musée)
-- ===============================
CREATE TABLE IF NOT EXISTS museum_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value JSONB,
    description TEXT,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- TABLE : Criteria Types (Types de critères)
-- ===============================
CREATE TABLE IF NOT EXISTS criteria_types (
    type_id SERIAL PRIMARY KEY,
    type TEXT NOT NULL UNIQUE,         -- 'age', 'thematique', 'style_texte', etc.
    label TEXT NOT NULL,               -- 'Âge du visiteur', 'Thématique', 'Style de texte'
    description TEXT,                  -- Description du critère
    ordre INTEGER DEFAULT 0,           -- Ordre d'affichage dans les formulaires
    is_required BOOLEAN DEFAULT TRUE,  -- Si le critère est obligatoire pour générer
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- TABLE : Criterias (Paramètres de chaque critère)
-- ===============================
CREATE TABLE IF NOT EXISTS criterias (
    criteria_id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,                -- 'age', 'thematique', 'style_texte'
    name TEXT NOT NULL,                -- 'enfant', 'technique_picturale', 'analyse'
    label TEXT NOT NULL,               -- Libellé affichage (ex: "Enfant (6-12 ans)")
    description TEXT,                  -- Description longue
    image_link TEXT,                   -- URL image/icône
    ai_indication TEXT,                -- Indication pour l'IA lors de la génération
    ordre INTEGER DEFAULT 0,           -- Ordre d'affichage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, name),                -- Un paramètre unique par type
    FOREIGN KEY (type) REFERENCES criteria_types(type) ON DELETE CASCADE
);

-- ===============================
-- TABLE LEGACY SUPPRIMÉE : oeuvre_criterias
-- (Remplacée par pregenerations.criteria_combination JSONB)
-- ===============================

-- ===============================
-- TABLE : Pregeneration_Criterias (Table de liaison pour requêtes)
-- ===============================
CREATE TABLE IF NOT EXISTS pregeneration_criterias (
    pregeneration_id INTEGER NOT NULL REFERENCES pregenerations(pregeneration_id) ON DELETE CASCADE,
    criteria_id INTEGER NOT NULL REFERENCES criterias(criteria_id) ON DELETE CASCADE,
    PRIMARY KEY (pregeneration_id, criteria_id)
);

-- Index pour JOIN rapides
CREATE INDEX IF NOT EXISTS idx_pregeneration_criterias_criteria 
    ON pregeneration_criterias(criteria_id);

-- ===============================
-- TABLES LEGACY SUPPRIMÉES
-- (generated_guide, criterias_guide - jamais utilisées)
-- ===============================

-- ===============================
CREATE INDEX IF NOT EXISTS idx_oeuvres_artiste ON oeuvres(artiste_id);
CREATE INDEX IF NOT EXISTS idx_oeuvres_mouvement ON oeuvres(mouvement_id);
CREATE INDEX IF NOT EXISTS idx_pregenerations_oeuvre ON pregenerations(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_sections_oeuvre ON sections(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_anecdotes_oeuvre ON anecdotes(oeuvre_id);

-- ===============================
-- INDEX ET TABLE LEGACY SUPPRIMÉS
-- (idx_chunk_oeuvre, idx_embeddings_chunk - tables chunk/embeddings supprimées)
-- (criterias_pregeneration - doublon de pregeneration_criterias)
-- ===============================

-- ===============================
-- TABLE : Points d'entrée du musée
-- ===============================
CREATE TABLE IF NOT EXISTS museum_entrances (
    entrance_id SERIAL PRIMARY KEY,
    plan_id INTEGER REFERENCES plans(plan_id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Entrée principale',
    x NUMERIC(10, 2) NOT NULL,
    y NUMERIC(10, 2) NOT NULL,
    icon TEXT DEFAULT 'door-open',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche rapide par plan
CREATE INDEX IF NOT EXISTS idx_entrances_plan_id ON museum_entrances(plan_id);

-- ===============================
-- INDEX POUR PERFORMANCES
-- ===============================
CREATE INDEX IF NOT EXISTS idx_entities_plan_id ON entities(plan_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_points_entity_id ON points(entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_cible ON relations(cible_id);
-- INDEX LEGACY SUPPRIMÉ : idx_chunk_oeuvre_id (table chunk supprimée)

-- ===============================
-- TABLE : Users (Authentification)
-- ===============================
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin_musee', 'accueil')),
  name VARCHAR(100) NOT NULL,
  musee_id VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ===============================
-- DONNÉES PAR DÉFAUT
-- ===============================
INSERT INTO stats (stats_id) VALUES (1) ON CONFLICT DO NOTHING;

-- Super Admin par défaut (mot de passe: admin123)
-- Hash généré avec bcrypt, rounds=10
INSERT INTO users (username, password_hash, role, name, is_active) VALUES
('admin', '$2b$10$rKqF3ZH0GmP5X8u9yJ8xXe5LzVxH1qC7W5iN3vZ8K2fJ9wR4tL6Qm', 'super_admin', 'Administrateur Principal', true)
ON CONFLICT (username) DO NOTHING;

-- Paramètres du musée par défaut
INSERT INTO museum_settings (setting_key, setting_value, description, category) VALUES
('museum_name', '"Louvre-Lens"', 'Nom du musée', 'general'),
('museum_title', '"Bienvenue au Louvre-Lens !\nVotre expérience commence ici !\nLaissez-vous guider !"', 'Titre d''accueil affiché aux visiteurs', 'general'),
('museum_image_url', '"/placeholder.svg"', 'URL de l''image d''accueil du musée', 'general'),
('opening_hours', '{"lundi": {"open": "09:00", "close": "18:00", "closed": false}, "mardi": {"open": "09:00", "close": "18:00", "closed": false}, "mercredi": {"open": "09:00", "close": "18:00", "closed": false}, "jeudi": {"open": "09:00", "close": "18:00", "closed": false}, "vendredi": {"open": "09:00", "close": "18:00", "closed": false}, "samedi": {"open": "10:00", "close": "19:00", "closed": false}, "dimanche": {"open": "10:00", "close": "18:00", "closed": false}}'::jsonb, 'Horaires d''ouverture du musée', 'general')
ON CONFLICT (setting_key) DO NOTHING;

-- Insertion des types de critères par défaut
INSERT INTO criteria_types (type, label, description, ordre, is_required) VALUES
('age', 'Âge du visiteur', 'Profil d''âge pour adapter le niveau de langage', 1, true),
('thematique', 'Thématique', 'Angle d''approche de l''œuvre', 2, true),
('style_texte', 'Style de narration', 'Ton et structure du texte généré', 3, true)
ON CONFLICT (type) DO NOTHING;

-- Insertion des paramètres de critères par défaut
INSERT INTO criterias (type, name, label, description, ordre) VALUES
-- Paramètres AGE
('age', 'enfant', 'Enfant', 'Parcours adapté aux enfants (6-12 ans)', 1),
('age', 'ado', 'Adolescent', 'Parcours pour adolescents (13-17 ans)', 2),
('age', 'adulte', 'Adulte', 'Parcours adulte standard', 3),
('age', 'senior', 'Senior', 'Parcours adapté aux seniors (65+ ans)', 4),

-- Paramètres THEMATIQUE
('thematique', 'technique_picturale', 'Technique Picturale', 'Focus sur les techniques artistiques et matérielles', 1),
('thematique', 'biographie', 'Biographie', 'Histoire de vie des artistes', 2),
('thematique', 'historique', 'Contexte Historique', 'Contexte historique et culturel des œuvres', 3),

-- Paramètres STYLE_TEXTE
('style_texte', 'analyse', 'Analyse', 'Analyse approfondie et structurée', 1),
('style_texte', 'decouverte', 'Découverte', 'Ton engageant et exploratoire', 2),
('style_texte', 'anecdote', 'Anecdote', 'Récits et histoires captivantes', 3)
ON CONFLICT (type, name) DO NOTHING;
