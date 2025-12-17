#!/usr/bin/env python3
"""
Fonctions de gestion des prégénérations optimisées avec batch inserts
"""

import sqlite3
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

def _connect_pregeneration(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Connexion à la base de données pour les prégénérations"""
    if db_path:
        db_path = Path(db_path)
    else:
        # Par défaut : base dans database/
        current_dir = Path(__file__).parent
        db_path = current_dir / ".." / ".." / "database" / "museum_v1.db"
    
    # Résoudre le chemin et créer la connexion
    resolved_path = db_path.resolve()
    conn = sqlite3.connect(str(resolved_path))
    conn.row_factory = sqlite3.Row
    return conn

def _connect_structured(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Alias pour compatibilité"""
    return _connect_pregeneration(db_path)

def add_pregeneration(oeuvre_id: int, age_cible: str, thematique: str, 
                     style_texte: str, pregeneration_text: str, 
                     voice_link: Optional[str] = None,
                     db_path: Optional[str] = None) -> Optional[int]:
    """
    Ajoute ou met à jour une prégénération.
    
    Args:
        oeuvre_id: ID de l'œuvre
        age_cible: enfant|ado|adulte|senior  
        thematique: technique_picturale|biographie|historique
        style_texte: analyse|decouverte|anecdote
        pregeneration_text: Contenu prégénéré
        voice_link: Lien audio (optionnel)
        db_path: Chemin vers la base de données
    
    Returns:
        ID de la prégénération créée/mise à jour ou None si erreur
    """
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    try:
        # Vérifier si existe déjà
        cur.execute("""
            SELECT pregeneration_id FROM pregenerations 
            WHERE oeuvre_id = ? AND age_cible = ? AND thematique = ? AND style_texte = ?
        """, (oeuvre_id, age_cible, thematique, style_texte))
        
        existing = cur.fetchone()
        
        if existing:
            # Mettre à jour
            cur.execute("""
                UPDATE pregenerations 
                SET pregeneration_text = ?, voice_link = ?, updated_at = CURRENT_TIMESTAMP
                WHERE pregeneration_id = ?
            """, (pregeneration_text, voice_link, existing[0]))
            pregeneration_id = existing[0]
        else:
            # Insérer nouveau
            cur.execute("""
                INSERT INTO pregenerations (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text, voice_link)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text, voice_link))
            pregeneration_id = cur.lastrowid
        
        conn.commit()
        return pregeneration_id
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Erreur lors de l'ajout de la prégénération: {e}")
        return None
    finally:
        conn.close()

def add_pregenerations_batch(pregenerations: List[Tuple[int, str, str, str, str]], 
                           db_path: Optional[str] = None) -> List[int]:
    """
    Ajoute plusieurs prégénérations en une seule transaction (optimisé).
    
    Args:
        pregenerations: Liste de tuples (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text)
        db_path: Chemin vers la base de données
    
    Returns:
        Liste des IDs des prégénérations créées
    """
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    created_ids = []
    
    try:
        conn.execute("BEGIN TRANSACTION")
        
        for oeuvre_id, age_cible, thematique, style_texte, pregeneration_text in pregenerations:
            # Vérifier si existe déjà
            cur.execute("""
                SELECT pregeneration_id FROM pregenerations 
                WHERE oeuvre_id = ? AND age_cible = ? AND thematique = ? AND style_texte = ?
            """, (oeuvre_id, age_cible, thematique, style_texte))
            
            existing = cur.fetchone()
            
            if existing:
                # Mettre à jour
                cur.execute("""
                    UPDATE pregenerations 
                    SET pregeneration_text = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE pregeneration_id = ?
                """, (pregeneration_text, existing[0]))
                created_ids.append(existing[0])
            else:
                # Insérer nouveau
                cur.execute("""
                    INSERT INTO pregenerations (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text, voice_link)
                    VALUES (?, ?, ?, ?, ?, NULL)
                """, (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text))
                created_ids.append(cur.lastrowid)
        
        conn.commit()
        return created_ids
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Erreur lors du batch insert: {e}")
        return []
    finally:
        conn.close()

def get_pregeneration(oeuvre_id: int, age_cible: str, thematique: str, 
                     style_texte: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Récupère une prégénération spécifique.
    """
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    try:
        cur.execute("""
            SELECT * FROM pregenerations 
            WHERE oeuvre_id = ? AND age_cible = ? AND thematique = ? AND style_texte = ?
        """, (oeuvre_id, age_cible, thematique, style_texte))
        
        result = cur.fetchone()
        return dict(result) if result else None
        
    except Exception as e:
        print(f"❌ Erreur lors de la récupération: {e}")
        return None
    finally:
        conn.close()

def get_pregeneration_stats(db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Récupère les statistiques de prégénération.
    """
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    try:
        # Total prégénérations
        cur.execute("SELECT COUNT(*) FROM pregenerations")
        total_pregenerations = cur.fetchone()[0]
        
        # Œuvres avec prégénérations
        cur.execute("SELECT COUNT(DISTINCT oeuvre_id) FROM pregenerations")
        covered_artworks = cur.fetchone()[0]
        
        # Total œuvres
        cur.execute("SELECT COUNT(*) FROM oeuvres")
        total_artworks = cur.fetchone()[0]
        
        coverage_percentage = (covered_artworks / total_artworks * 100) if total_artworks > 0 else 0
        
        # Distribution par âge
        cur.execute("""
            SELECT age_cible, COUNT(*) 
            FROM pregenerations 
            GROUP BY age_cible 
            ORDER BY age_cible
        """)
        age_distribution = dict(cur.fetchall())
        
        # Distribution par thématique
        cur.execute("""
            SELECT thematique, COUNT(*) 
            FROM pregenerations 
            GROUP BY thematique 
            ORDER BY thematique
        """)
        theme_distribution = dict(cur.fetchall())
        
        # Distribution par style
        cur.execute("""
            SELECT style_texte, COUNT(*) 
            FROM pregenerations 
            GROUP BY style_texte 
            ORDER BY style_texte
        """)
        style_distribution = dict(cur.fetchall())
        
        return {
            'total_pregenerations': total_pregenerations,
            'covered_artworks': covered_artworks,
            'total_artworks': total_artworks,
            'coverage_percentage': coverage_percentage,
            'age_distribution': age_distribution,
            'theme_distribution': theme_distribution,
            'style_distribution': style_distribution
        }
        
    except Exception as e:
        print(f"❌ Erreur lors du calcul des statistiques: {e}")
        return None
    finally:
        conn.close()

def get_all_pregenerations_for_artwork(oeuvre_id: int, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Récupère toutes les prégénérations d'une œuvre.
    """
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    try:
        cur.execute("""
            SELECT * FROM pregenerations 
            WHERE oeuvre_id = ?
            ORDER BY age_cible, thematique, style_texte
        """, (oeuvre_id,))
        
        results = cur.fetchall()
        return [dict(row) for row in results]
        
    except Exception as e:
        print(f"❌ Erreur lors de la récupération des prégénérations: {e}")
        return []
    finally:
        conn.close()

# Fonctions de validation
def validate_criteria(age_cible: str, thematique: str, style_texte: str) -> bool:
    """Valide les critères de prégénération"""
    valid_ages = ['enfant', 'ado', 'adulte', 'senior']
    valid_themes = ['technique_picturale', 'biographie', 'historique']
    valid_styles = ['analyse', 'decouverte', 'anecdote']
    
    return (age_cible in valid_ages and 
            thematique in valid_themes and 
            style_texte in valid_styles)

def get_criteria_options() -> Dict[str, List[str]]:
    """Retourne les options disponibles pour chaque critère"""
    return {
        'age_cible': ['enfant', 'ado', 'adulte', 'senior'],
        'thematique': ['technique_picturale', 'biographie', 'historique'],
        'style_texte': ['analyse', 'decouverte', 'anecdote']
    }