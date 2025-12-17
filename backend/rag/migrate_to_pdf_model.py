#!/usr/bin/env python3
"""
Migration pour adapter la base de données au modèle PDF standardisé
Basé sur la structure: Titre, Artiste, Lieu de naissance, Date, Matériaux/technique,
Période/Mouvement, Provenance, Contexte & commande, Description, Analyse matérielle & technique,
Iconographie/symbolique/interprétations, Réception/circulation/postérité,
Parcours/conservation/documentation, Anecdotes
"""

import sqlite3
from pathlib import Path
from typing import Optional


def get_db_path() -> Path:
    """Retourne le chemin vers la base de données."""
    return Path(__file__).parent.parent.parent / "database" / "museum_v1.db"


def create_model_compliant_structure(db_path: Optional[str] = None):
    """Crée la structure BDD conforme au modèle PDF"""
    
    db_file = db_path or str(get_db_path())
    conn = sqlite3.connect(db_file)
    cur = conn.cursor()
    
    print("🔄 Création de la structure conforme au modèle PDF...")
    
    # Supprimer les anciennes tables si elles existent
    old_tables = ['oeuvres', 'artistes', 'mouvements', 'sections', 'anecdotes']
    for table in old_tables:
        cur.execute(f"DROP TABLE IF EXISTS {table}")
    
    # 1. Table Artistes (enrichie avec lieu de naissance)
    cur.execute("""
        CREATE TABLE artistes (
            artiste_id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            lieu_naissance TEXT,
            date_naissance TEXT,
            date_deces TEXT,
            biographie TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 2. Table Mouvements/Périodes
    cur.execute("""
        CREATE TABLE mouvements (
            mouvement_id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL UNIQUE,
            description TEXT,
            periode_debut TEXT,
            periode_fin TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 3. Table Œuvres (structure complète selon le modèle)
    cur.execute("""
        CREATE TABLE oeuvres (
            oeuvre_id INTEGER PRIMARY KEY AUTOINCREMENT,
            -- Informations de base du modèle PDF
            titre TEXT NOT NULL,
            artiste_nom TEXT,
            artiste_id INTEGER,
            date_oeuvre TEXT,
            materiaux_technique TEXT,
            periode_mouvement TEXT,
            mouvement_id INTEGER,
            provenance TEXT,
            
            -- Sections documentaires du modèle PDF
            contexte_commande TEXT,
            description TEXT,
            analyse_materielle_technique TEXT,
            iconographie_symbolique TEXT,
            reception_circulation_posterite TEXT,
            parcours_conservation_doc TEXT,
            
            -- Métadonnées techniques
            dimensions TEXT,
            localisation_salle TEXT DEFAULT 'Salle 1',
            position TEXT,
            image_link TEXT,
            pdf_link TEXT,
            file_name TEXT,
            file_path TEXT,
            
            -- Timestamps
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            -- Clés étrangères
            FOREIGN KEY (artiste_id) REFERENCES artistes(artiste_id),
            FOREIGN KEY (mouvement_id) REFERENCES mouvements(mouvement_id)
        )
    """)
    
    # 4. Table Anecdotes (liées aux œuvres)
    cur.execute("""
        CREATE TABLE anecdotes (
            anecdote_id INTEGER PRIMARY KEY AUTOINCREMENT,
            oeuvre_id INTEGER NOT NULL,
            numero INTEGER,
            contenu TEXT NOT NULL,
            type TEXT DEFAULT 'generale',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (oeuvre_id) REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE
        )
    """)
    
    # 5. Index pour les recherches
    cur.execute("CREATE INDEX idx_oeuvres_titre ON oeuvres(titre)")
    cur.execute("CREATE INDEX idx_oeuvres_artiste ON oeuvres(artiste_nom)")
    cur.execute("CREATE INDEX idx_oeuvres_mouvement ON oeuvres(periode_mouvement)")
    cur.execute("CREATE INDEX idx_anecdotes_oeuvre ON anecdotes(oeuvre_id)")
    
    conn.commit()
    conn.close()
    
    print("✅ Structure de base conforme au modèle PDF créée")


def add_sample_data():
    """Ajoute des données d'exemple"""
    conn = sqlite3.connect(str(get_db_path()))
    cur = conn.cursor()
    
    # Exemple d'artiste
    cur.execute("""
        INSERT OR IGNORE INTO artistes (nom, lieu_naissance) 
        VALUES ('Pablo Picasso', 'Málaga, Espagne')
    """)
    
    # Exemple de mouvement
    cur.execute("""
        INSERT OR IGNORE INTO mouvements (nom, description, periode_debut) 
        VALUES ('Cubisme', 'Mouvement artistique révolutionnaire', '1907')
    """)
    
    conn.commit()
    conn.close()
    print("✅ Données d'exemple ajoutées")


if __name__ == "__main__":
    print("🗄️ Migration vers la structure du modèle PDF standardisé")
    
    create_model_compliant_structure()
    add_sample_data()
    
    print("\n🎉 Migration terminée!")
    print("La base de données est maintenant conforme au modèle PDF avec:")
    print("  • Table artistes (avec lieu de naissance)")
    print("  • Table mouvements") 
    print("  • Table oeuvres (tous les champs du modèle PDF)")
    print("  • Table anecdotes (multiples par œuvre)")