#!/usr/bin/env python3
"""
Fonctions de base de données conformes au modèle PDF standardisé
"""

import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any


def get_structured_db_path() -> Path:
    """Retourne le chemin vers la base de données museum_v1.db."""
    return Path(__file__).parent.parent.parent / "database" / "museum_v1.db"


def _connect_structured(db_path: Optional[str] = None):
    """Connexion à la base de données structurée."""
    db_file = db_path or str(get_structured_db_path())
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


# FONCTIONS POUR LES ARTISTES
def add_artist(nom: str, lieu_naissance: Optional[str] = None, 
               date_naissance: Optional[str] = None, date_deces: Optional[str] = None,
               biographie: Optional[str] = None, db_path: Optional[str] = None) -> int:
    """Ajoute un artiste et retourne son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Vérifier si l'artiste existe déjà
    cur.execute("SELECT artiste_id FROM artistes WHERE nom = ?", (nom,))
    existing = cur.fetchone()
    if existing:
        conn.close()
        return existing['artiste_id']
    
    # Ajouter le nouvel artiste
    cur.execute("""
        INSERT INTO artistes (nom, lieu_naissance, date_naissance, date_deces, biographie)
        VALUES (?, ?, ?, ?, ?)
    """, (nom, lieu_naissance, date_naissance, date_deces, biographie))
    
    artiste_id = cur.lastrowid
    conn.commit()
    conn.close()
    return artiste_id


def get_artist(artiste_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Récupère un artiste par son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("SELECT * FROM artistes WHERE artiste_id = ?", (artiste_id,))
    result = cur.fetchone()
    conn.close()
    
    return dict(result) if result else None


# FONCTIONS POUR LES MOUVEMENTS
def add_movement(nom: str, description: Optional[str] = None,
                periode_debut: Optional[str] = None, periode_fin: Optional[str] = None,
                db_path: Optional[str] = None) -> int:
    """Ajoute un mouvement artistique et retourne son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Vérifier si le mouvement existe déjà
    cur.execute("SELECT mouvement_id FROM mouvements WHERE nom = ?", (nom,))
    existing = cur.fetchone()
    if existing:
        conn.close()
        return existing['mouvement_id']
    
    # Ajouter le nouveau mouvement
    cur.execute("""
        INSERT INTO mouvements (nom, description, periode_debut, periode_fin)
        VALUES (?, ?, ?, ?)
    """, (nom, description, periode_debut, periode_fin))
    
    mouvement_id = cur.lastrowid
    conn.commit()
    conn.close()
    return mouvement_id


# FONCTIONS POUR LES ŒUVRES (conforme au modèle PDF)
def add_artwork(titre: str, artiste_nom: Optional[str] = None, artiste_id: Optional[int] = None,
                date_oeuvre: Optional[str] = None, materiaux_technique: Optional[str] = None,
                periode_mouvement: Optional[str] = None, mouvement_id: Optional[int] = None,
                provenance: Optional[str] = None, contexte_commande: Optional[str] = None,
                description: Optional[str] = None, analyse_materielle_technique: Optional[str] = None,
                iconographie_symbolique: Optional[str] = None, 
                reception_circulation_posterite: Optional[str] = None,
                parcours_conservation_doc: Optional[str] = None,
                dimensions: Optional[str] = None, localisation_salle: Optional[str] = None,
                position: Optional[str] = None, image_link: Optional[str] = None,
                pdf_link: Optional[str] = None, file_name: Optional[str] = None,
                file_path: Optional[str] = None, db_path: Optional[str] = None) -> int:
    """Ajoute une œuvre d'art conforme au modèle PDF et retourne son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Valeur par défaut pour la salle
    if not localisation_salle:
        localisation_salle = 'Salle 1'
    
    # Vérifier si l'œuvre existe déjà (éviter les doublons)
    cur.execute("SELECT oeuvre_id FROM oeuvres WHERE titre = ? AND file_name = ?", 
                (titre, file_name))
    existing = cur.fetchone()
    if existing:
        print(f"⚠️  Œuvre \"{titre}\" déjà existante (ID: {existing['oeuvre_id']})")
        conn.close()
        return existing['oeuvre_id']
    
    # Ajouter la nouvelle œuvre
    cur.execute("""
        INSERT INTO oeuvres (
            titre, artiste_nom, artiste_id, date_oeuvre, materiaux_technique,
            periode_mouvement, mouvement_id, provenance, contexte_commande, description,
            analyse_materielle_technique, iconographie_symbolique, reception_circulation_posterite,
            parcours_conservation_doc, dimensions, localisation_salle, position,
            image_link, pdf_link, file_name, file_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (titre, artiste_nom, artiste_id, date_oeuvre, materiaux_technique,
          periode_mouvement, mouvement_id, provenance, contexte_commande, description,
          analyse_materielle_technique, iconographie_symbolique, reception_circulation_posterite,
          parcours_conservation_doc, dimensions, localisation_salle, position,
          image_link, pdf_link, file_name, file_path))
    
    artwork_id = cur.lastrowid
    conn.commit()
    conn.close()
    return artwork_id


def get_artwork(oeuvre_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Récupère une œuvre avec toutes ses informations."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT o.*, a.nom as artiste_details, a.lieu_naissance, 
               m.nom as mouvement_details, m.description as mouvement_description
        FROM oeuvres o
        LEFT JOIN artistes a ON o.artiste_id = a.artiste_id
        LEFT JOIN mouvements m ON o.mouvement_id = m.mouvement_id
        WHERE o.oeuvre_id = ?
    """, (oeuvre_id,))
    
    result = cur.fetchone()
    conn.close()
    
    return dict(result) if result else None


# FONCTIONS POUR LES ANECDOTES
def add_anecdote(oeuvre_id: int, contenu: str, numero: Optional[int] = None,
                type_anecdote: str = 'generale', db_path: Optional[str] = None) -> int:
    """Ajoute une anecdote liée à une œuvre (évite les doublons)."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Vérifier si cette anecdote existe déjà pour cette œuvre
    cur.execute("""
        SELECT anecdote_id FROM anecdotes 
        WHERE oeuvre_id = ? AND contenu = ?
    """, (oeuvre_id, contenu))
    
    existing = cur.fetchone()
    if existing:
        conn.close()
        print(f"⚠️  Anecdote déjà existante (ID: {existing[0]})")
        return existing[0]
    
    # Insérer la nouvelle anecdote
    cur.execute("""
        INSERT INTO anecdotes (oeuvre_id, numero, contenu, type)
        VALUES (?, ?, ?, ?)
    """, (oeuvre_id, numero, contenu, type_anecdote))
    
    anecdote_id = cur.lastrowid
    conn.commit()
    conn.close()
    return anecdote_id


def get_anecdotes_for_artwork(oeuvre_id: int, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère toutes les anecdotes d'une œuvre."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT * FROM anecdotes 
        WHERE oeuvre_id = ? 
        ORDER BY numero ASC, anecdote_id ASC
    """, (oeuvre_id,))
    
    results = cur.fetchall()
    conn.close()
    
    return [dict(row) for row in results]


# FONCTIONS DE RECHERCHE ET LISTAGE
def get_all_artworks(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère toutes les œuvres."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT o.*, a.nom as artiste_details, m.nom as mouvement_details
        FROM oeuvres o
        LEFT JOIN artistes a ON o.artiste_id = a.artiste_id
        LEFT JOIN mouvements m ON o.mouvement_id = m.mouvement_id
        ORDER BY o.titre
    """)
    
    results = cur.fetchall()
    conn.close()
    
    return [dict(row) for row in results]


def search_artworks(query: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Recherche textuelle dans les œuvres."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT o.*, a.nom as artiste_details, m.nom as mouvement_details
        FROM oeuvres o
        LEFT JOIN artistes a ON o.artiste_id = a.artiste_id
        LEFT JOIN mouvements m ON o.mouvement_id = m.mouvement_id
        WHERE o.titre LIKE ? OR o.artiste_nom LIKE ? OR o.description LIKE ?
           OR o.periode_mouvement LIKE ? OR o.materiaux_technique LIKE ?
        ORDER BY o.titre
    """, (f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%"))
    
    results = cur.fetchall()
    conn.close()
    
    return [dict(row) for row in results]


# FONCTIONS D'INITIALISATION
def init_structured_db(db_path: Optional[str] = None) -> None:
    """Initialise la base de données avec la structure du modèle PDF."""
    print("⚠️ Pour créer la structure conforme au modèle PDF, utilisez:")
    print("   python migrate_to_pdf_model.py")
    
    db_file = db_path or str(get_structured_db_path())
    
    if not Path(db_file).exists():
        print(f"❌ Base de données {db_file} non trouvée.")
        print("Exécutez d'abord: python migrate_to_pdf_model.py")
        return
    
    print("✅ Base de données museum_v1.db prête (structure modèle PDF)")


# Fonctions de compatibilité avec l'ancien système
def add_documentary_section(*args, **kwargs):
    """Fonction de compatibilité - les sections sont maintenant intégrées dans l'œuvre"""
    pass

def get_documentary_sections(*args, **kwargs):
    """Fonction de compatibilité"""
    return []