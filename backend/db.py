import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any


def get_default_db_path() -> Path:
    """Retourne le chemin par défaut de la base de données (fichier processing.db à côté du module)."""
    return Path(__file__).parent / "processing.db"


def init_db(db_path: Optional[str] = None) -> None:
    """Initialise la base SQLite et crée les tables si nécessaire."""
    db_file = db_path or str(get_default_db_path())
    conn = sqlite3.connect(db_file)
    cur = conn.cursor()

    # Table Oeuvres selon le schéma cible
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS oeuvres (
            oeuvre_id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            artist TEXT,
            description TEXT,
            image_link TEXT,
            pdf_link TEXT,
            room INTEGER,
            file_name TEXT,
            file_path TEXT,
            word_count INTEGER,
            age_min INTEGER,
            age_max INTEGER,
            duration_minutes INTEGER,
            artwork_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    
    # Table Plan pour les salles
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS plans (
            plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT,
            description TEXT,
            date_creation DATE
        )
        """
    )
    
    # Table Points pour les coordonnées
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS points (
            point_id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id INTEGER,
            x REAL,
            y REAL,
            ordre INTEGER
        )
        """
    )
    
    # Table Chunk pour le RAG
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS chunk (
            chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
            oeuvre_id INTEGER,
            chunk_text TEXT NOT NULL,
            chunk_index INTEGER,
            content_hash TEXT,
            token_count INTEGER,
            start_char INTEGER,
            end_char INTEGER,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(oeuvre_id) REFERENCES Oeuvres(oeuvre_id) ON DELETE CASCADE
        )
        """
    )
    
    # Table pour les guides générés (selon schéma bdd v2)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS generated_guide (
            generated_guide_id TEXT PRIMARY KEY,
            guide_text TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    
    # Table pour les embeddings (nécessaire pour le RAG)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS Embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_id INTEGER UNIQUE,
            model_name TEXT NOT NULL,
            embedding_vector BLOB NOT NULL,
            vector_dimension INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chunk_id) REFERENCES Chunk(chunk_id) ON DELETE CASCADE
        )
        """
    )

    conn.commit()
    conn.close()


def _connect(db_path: Optional[str] = None):
    db_file = db_path or str(get_default_db_path())
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


def add_oeuvre(file_name: str, file_path: str, title: Optional[str] = None, 
               description: Optional[str] = None, word_count: Optional[int] = None, 
               artist: Optional[str] = None, pdf_link: Optional[str] = None, 
               db_path: Optional[str] = None) -> int:
    """Insère une œuvre et retourne son id. Évite les doublons basés sur (title, file_name)."""
    conn = _connect(db_path)
    cur = conn.cursor()
    
    # Vérifier si l'œuvre existe déjà
    if title and file_name:
        cur.execute("SELECT oeuvre_id FROM oeuvres WHERE title = ? AND file_name = ?", (title, file_name))
        existing = cur.fetchone()
        if existing:
            print(f"⚠️  Œuvre '{title}' ({file_name}) existe déjà (ID: {existing[0]})")
            conn.close()
            return existing[0]
    
    # Insérer la nouvelle œuvre avec pdf_link
    cur.execute(
        "INSERT INTO oeuvres (file_name, file_path, title, description, word_count, artist, pdf_link) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (file_name, file_path, title, description, word_count, artist, pdf_link),
    )
    oeuvre_id = cur.lastrowid
    conn.commit()
    conn.close()
    return oeuvre_id

# Alias pour compatibilité
def add_document(file_name: str, file_path: str, title: Optional[str] = None, 
                 description: Optional[str] = None, word_count: Optional[int] = None, 
                 artist: Optional[str] = None, db_path: Optional[str] = None) -> int:
    # Créer le pdf_link automatiquement pour tous les fichiers dans uploads/pdfs
    pdf_link = f"/uploads/pdfs/{file_name}"
    return add_oeuvre(file_name, file_path, title, description, word_count, artist, pdf_link, db_path)


def get_oeuvre(oeuvre_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM oeuvres WHERE oeuvre_id = ?", (oeuvre_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

# Alias pour compatibilité
def get_document(document_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    return get_oeuvre(document_id, db_path)


def add_anecdote(oeuvre_id: int, anecdote: str, db_path: Optional[str] = None) -> int:
    """Fonction obsolète - les anecdotes sont maintenant intégrées dans les chunks"""
    # Ne fait plus rien - compatibilité maintenue
    return 0


def get_anecdotes(document_id: int, db_path: Optional[str] = None) -> List[str]:
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT anecdote FROM anecdotes WHERE document_id = ? ORDER BY created_at", (document_id,))
    rows = cur.fetchall()
    conn.close()
    return [r[0] for r in rows]


def add_generation(query: str, criteria: str, model_name: str, response: str, 
                   chunks_count: int, processing_time_ms: int, ollama_time_ms: int, 
                   total_time_ms: int, db_path: Optional[str] = None) -> int:
    """Ajoute un enregistrement de génération et retourne son id."""
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO generations (query, criteria, model_name, response, chunks_count, processing_time_ms, ollama_time_ms, total_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (query, criteria, model_name, response, chunks_count, processing_time_ms, ollama_time_ms, total_time_ms)
    )
    gen_id = cur.lastrowid
    conn.commit()
    conn.close()
    return gen_id


def add_generated_guide(guide_id: str, guide_text: str, db_path: Optional[str] = None) -> str:
    """Ajoute un guide généré et retourne son id."""
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute(
        "INSERT OR REPLACE INTO generated_guide (guide_id, guide_text) VALUES (?, ?)",
        (guide_id, guide_text)
    )
    conn.commit()
    conn.close()
    return guide_id

# Fonction de compatibilité (obsolète)
def add_parcours(criteria: str, museum_mapping: str, selected_works: str, route_plan: str, 
                 guide_text: str, total_duration_minutes: int, model_name: str, 
                 processing_time_ms: int, db_path: Optional[str] = None) -> int:
    """Fonction obsolète - utilise maintenant add_generated_guide."""
    import time
    guide_id = f"guide_{int(time.time())}"
    add_generated_guide(guide_id, guide_text, db_path)
    return 1  # ID fictif pour compatibilité


def get_works_for_parcours(age_min: int, age_max: int, artwork_type: Optional[str] = None, 
                          db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère les œuvres adaptées aux critères d'âge et de type."""
    conn = _connect(db_path)
    cur = conn.cursor()
    
    query = """
    SELECT * FROM oeuvres 
    WHERE (age_min IS NULL OR age_min <= ?) 
    AND (age_max IS NULL OR age_max >= ?)
    """
    params = [age_max, age_min]
    
    if artwork_type:
        query += " AND (artwork_type = ? OR artwork_type IS NULL)"
        params.append(artwork_type)
    
    query += " ORDER BY created_at DESC"
    
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ==================== RAG FUNCTIONS ====================

def add_chunk(oeuvre_id: int, chunk_index: int, content: str, content_hash: str, 
              token_count: Optional[int] = None, start_char: Optional[int] = None, 
              end_char: Optional[int] = None, metadata: Optional[str] = None, 
              db_path: Optional[str] = None) -> int:
    """Ajoute un chunk d'œuvre pour le RAG."""
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO chunk (oeuvre_id, chunk_index, chunk_text, content_hash, 
           token_count, start_char, end_char, metadata) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (oeuvre_id, chunk_index, content, content_hash, token_count, start_char, end_char, metadata)
    )
    chunk_id = cur.lastrowid
    conn.commit()
    conn.close()
    return chunk_id


def get_chunks_by_oeuvre(oeuvre_id: int, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère tous les chunks d'une œuvre."""
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT * FROM chunk WHERE oeuvre_id = ? ORDER BY chunk_index", (oeuvre_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Alias pour compatibilité
def get_chunks_by_document(document_id: int, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    return get_chunks_by_oeuvre(document_id, db_path)


def add_embedding(chunk_id: int, model_name: str, embedding_vector: bytes, 
                  vector_dimension: int, db_path: Optional[str] = None) -> int:
    """Ajoute un embedding pour un chunk."""
    conn = _connect(db_path)
    cur = conn.cursor()
    try:
        cur.execute(
            """INSERT INTO embeddings (chunk_id, model_name, embedding_vector, vector_dimension) 
               VALUES (?, ?, ?, ?)""",
            (chunk_id, model_name, embedding_vector, vector_dimension)
        )
        embedding_id = cur.lastrowid
        conn.commit()
        return embedding_id
    except sqlite3.IntegrityError:
        cur.execute("SELECT id FROM embeddings WHERE chunk_id = ? AND model_name = ?", (chunk_id, model_name))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def get_embedding(chunk_id: int, model_name: str, db_path: Optional[str] = None) -> Optional[bytes]:
    """Récupère l'embedding d'un chunk pour un modèle donné."""
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute(
        "SELECT embedding_vector FROM embeddings WHERE chunk_id = ? AND model_name = ?",
        (chunk_id, model_name)
    )
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


if __name__ == "__main__":
    init_db()
    print(f"Base de données initialisée: {get_default_db_path()}")