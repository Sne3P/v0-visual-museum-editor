import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any


def get_structured_db_path() -> Path:
    """Retourne le chemin vers la base de données museum_v1.db existante."""
    return Path(__file__).parent.parent.parent / "database" / "museum_v1.db"


def _connect_structured(db_path: Optional[str] = None):
    """Connexion à la base de données structurée."""
    db_file = db_path or str(get_structured_db_path())
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


def init_structured_db(db_path: Optional[str] = None) -> None:
    """Initialise la base SQLite avec les nouvelles tables structurées sur la base existante."""
    print("⚠️ Pour migrer la base museum_v1.db existante, utilisez plutôt:")
    print("   python migrate_museum_v1.py")
    print("Cette fonction est maintenant adaptée pour la base migrée.")
    
    db_file = db_path or str(get_structured_db_path())
    
    # Vérifier si la base existe
    if not Path(db_file).exists():
        print(f"❌ Base de données {db_file} non trouvée.")
        print("Veuillez d'abord exécuter le script de migration:")
        print("   python migrate_museum_v1.py")
        return
    
    conn = sqlite3.connect(db_file)
    cur = conn.cursor()

    # Vérifier que les tables existent déjà (après migration)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = [row[0] for row in cur.fetchall()]
    
    required_tables = ['oeuvres', 'artistes', 'mouvements', 'sections', 'anecdotes']
    missing_tables = [t for t in required_tables if t not in existing_tables]
    
    if missing_tables:
        print(f"❌ Tables manquantes: {missing_tables}")
        print("Exécutez d'abord: python migrate_museum_v1.py")
        conn.close()
        return
    
    print("✅ Base de données museum_v1.db prête à être utilisée")
    conn.close()


# ===== FONCTIONS POUR LES ARTISTES =====

def add_artist(nom_complet: str, lieu_naissance: Optional[str] = None, 
               date_naissance: Optional[str] = None, date_deces: Optional[str] = None,
               db_path: Optional[str] = None) -> int:
    """Ajoute un artiste et retourne son ID. Évite les doublons."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Vérifier si l'artiste existe déjà
    cur.execute("SELECT id_artiste FROM artistes WHERE nom_complet = ?", (nom_complet,))
    existing = cur.fetchone()
    if existing:
        conn.close()
        return existing['id_artiste']
    
    # Ajouter le nouvel artiste
    cur.execute(
        "INSERT INTO artistes (nom_complet, lieu_naissance, date_naissance, date_deces) VALUES (?, ?, ?, ?)",
        (nom_complet, lieu_naissance, date_naissance, date_deces)
    )
    artist_id = cur.lastrowid
    conn.commit()
    conn.close()
    return artist_id


def add_artistic_movement(nom: str, periode: Optional[str] = None,
                         db_path: Optional[str] = None) -> int:
    """Ajoute un mouvement artistique et retourne son ID. Évite les doublons."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Vérifier si le mouvement existe déjà
    cur.execute("SELECT id_mouvement FROM mouvements WHERE nom = ?", (nom,))
    existing = cur.fetchone()
    if existing:
        conn.close()
        return existing['id_mouvement']
    
    # Ajouter le nouveau mouvement
    cur.execute(
        "INSERT INTO mouvements (nom, periode) VALUES (?, ?)",
        (nom, periode)
    )
    movement_id = cur.lastrowid
    conn.commit()
    conn.close()
    return movement_id


def add_artwork(title: str, artist: Optional[str] = None, id_artiste: Optional[int] = None, 
                id_mouvement: Optional[int] = None, date_creation: Optional[str] = None, 
                technique: Optional[str] = None, provenance: Optional[str] = None,
                image_link: Optional[str] = None, pdf_link: Optional[str] = None,
                room: Optional[int] = None, file_name: Optional[str] = None,
                file_path: Optional[str] = None, db_path: Optional[str] = None) -> int:
    """Ajoute une œuvre d'art et retourne son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Vérifier si l'œuvre existe déjà (basé sur titre et artiste)
    if artist:
        cur.execute("SELECT oeuvre_id FROM oeuvres WHERE title = ? AND artist = ?", (title, artist))
    else:
        cur.execute("SELECT oeuvre_id FROM oeuvres WHERE title = ? AND artist IS NULL", (title,))
    
    existing = cur.fetchone()
    if existing:
        conn.close()
        return existing['oeuvre_id']
    
    # Ajouter la nouvelle œuvre
    cur.execute(
        """INSERT INTO oeuvres 
           (title, artist, id_artiste, id_mouvement, date_creation, technique, 
            provenance, image_link, pdf_link, room, file_name, file_path) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, artist, id_artiste, id_mouvement, date_creation, technique,
         provenance, image_link, pdf_link, room, file_name, file_path)
    )
    artwork_id = cur.lastrowid
    conn.commit()
    conn.close()
    return artwork_id


def get_artwork(oeuvre_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Récupère une œuvre complète avec ses informations liées."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    # Récupérer l'œuvre avec les informations de l'artiste et du mouvement
    cur.execute("""
        SELECT o.*, 
               art.nom_complet as artist_full_name, art.lieu_naissance as artist_birthplace,
               m.nom as movement_name, m.periode as movement_period
        FROM oeuvres o
        LEFT JOIN artistes art ON o.id_artiste = art.id_artiste
        LEFT JOIN mouvements m ON o.id_mouvement = m.id_mouvement
        WHERE o.oeuvre_id = ?
    """, (oeuvre_id,))
    
    artwork_row = cur.fetchone()
    if not artwork_row:
        conn.close()
        return None
    
    artwork = dict(artwork_row)
    
    # Récupérer les sections documentaires
    cur.execute("""
        SELECT type_section, contenu 
        FROM sections 
        WHERE id_oeuvre = ? 
        ORDER BY id_section
    """, (oeuvre_id,))
    artwork['sections'] = [dict(row) for row in cur.fetchall()]
    
    # Récupérer les anecdotes
    cur.execute("SELECT contenu, index_anecdote FROM anecdotes WHERE id_oeuvre = ?", (oeuvre_id,))
    artwork['anecdotes'] = [dict(row) for row in cur.fetchall()]
    
    conn.close()
    return artwork


def add_documentary_section(oeuvre_id: int, type_section: str, contenu: str,
                          db_path: Optional[str] = None) -> int:
    """Ajoute une section documentaire et retourne son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute(
        "INSERT INTO sections (id_oeuvre, type_section, contenu) VALUES (?, ?, ?)",
        (oeuvre_id, type_section, contenu)
    )
    section_id = cur.lastrowid
    conn.commit()
    conn.close()
    return section_id


def add_anecdote_structured(oeuvre_id: int, contenu: str, index_anecdote: Optional[str] = None,
                          db_path: Optional[str] = None) -> int:
    """Ajoute une anecdote et retourne son ID."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute(
        "INSERT INTO anecdotes (id_oeuvre, contenu, index_anecdote) VALUES (?, ?, ?)",
        (oeuvre_id, contenu, index_anecdote)
    )
    anecdote_id = cur.lastrowid
    conn.commit()
    conn.close()
    return anecdote_id


def get_artwork_sections(oeuvre_id: int, type_section: Optional[str] = None,
                        db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère les sections documentaires d'une œuvre."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    if type_section:
        cur.execute(
            "SELECT * FROM sections WHERE id_oeuvre = ? AND type_section = ? ORDER BY id_section",
            (oeuvre_id, type_section)
        )
    else:
        cur.execute(
            "SELECT * FROM sections WHERE id_oeuvre = ? ORDER BY id_section",
            (oeuvre_id,)
        )
    
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_artwork_anecdotes(oeuvre_id: int, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère les anecdotes d'une œuvre."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM anecdotes WHERE id_oeuvre = ?", (oeuvre_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def search_artworks(query: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Recherche d'œuvres par titre, artiste ou contenu."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT DISTINCT o.oeuvre_id, o.title, o.artist, o.date_creation
        FROM oeuvres o
        LEFT JOIN sections s ON o.oeuvre_id = s.id_oeuvre
        LEFT JOIN anecdotes an ON o.oeuvre_id = an.id_oeuvre
        WHERE o.title LIKE ? OR o.artist LIKE ? OR s.contenu LIKE ? OR an.contenu LIKE ?
        ORDER BY o.title
    """, (f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%"))
    
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_all_artworks(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère toutes les œuvres avec leurs informations de base."""
    conn = _connect_structured(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT o.oeuvre_id, o.title, o.artist, 
               o.date_creation, m.nom as movement_name, o.pdf_link
        FROM oeuvres o
        LEFT JOIN mouvements m ON o.id_mouvement = m.id_mouvement
        ORDER BY o.title
    """)
    
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]


if __name__ == "__main__":
    # Initialiser la base de données
    init_structured_db()
    print("Base de données structurée initialisée !")