"""
Configuration centralisée pour MuseumVoice
Tous les paramètres configurables en un seul endroit
"""

from pathlib import Path
import os

class MuseumVoiceConfig:
    """Configuration centralisée pour MuseumVoice"""
    
    # CHEMINS ET DOSSIERS
    BASE_DIR = Path(__file__).parent.parent  # /backend/rag/ -> /backend/
    PDF_DIR = BASE_DIR.parent / "public/uploads/pdfs"  # Pointage vers le dossier frontend 
    INDEXES_DIR = BASE_DIR / "indexes" 
    DB_PATH = BASE_DIR.parent / "database/museum_v1.db"  # Utilise la même BDD que le frontend
    CACHE_DIR = BASE_DIR / "cache"
    
    # TRAITEMENT PDF
    PDF_SETTINGS = {
        'chunk_size': 500,           # Taille des chunks en caractères
        'chunk_overlap': 50,         # Chevauchement entre chunks
        'min_chunk_length': 100,     # Taille minimale d'un chunk
        'max_chunks_per_doc': 1000,  # Max chunks par document
        'supported_extensions': ['.pdf', '.txt', '.md']
    }
    
    # EMBEDDINGS ET RAG
    EMBEDDING_SETTINGS = {
        'model_name': 'sentence-transformers/all-MiniLM-L6-v2',
        'device': 'cpu',
        'batch_size': 32,
        'normalize_embeddings': True,
        'cache_embeddings': True,
        'embedding_dim': 384  # Dimension pour all-MiniLM-L6-v2
    }
    
    # RECHERCHE VECTORIELLE
    SEARCH_SETTINGS = {
        'default_top_k': 5,
        'max_top_k': 20,
        'similarity_threshold': 0.7,
        'faiss_index_type': 'IndexFlatIP',  # ou 'IndexIVFFlat' pour + de perf
        'enable_reranking': False
    }
    
    # GENERATION DE PARCOURS
    PARCOURS_SETTINGS = {
        'max_artworks': 10,
        'min_artworks': 3,
        'default_duration': 60,  # minutes
        'themes_disponibles': [
            'art_classique', 'art_moderne', 'histoire', 
            'sculpture', 'peinture', 'archeologie'
        ],
        'niveaux_difficulte': ['debutant', 'intermediaire', 'expert']
    }
    
    # MONITORING ET PERFORMANCE
    MONITORING_SETTINGS = {
        'enable_monitoring': True,
        'log_level': 'INFO',
        'performance_threshold_ms': 1000,  # Seuil d'alerte performance
        'save_detailed_logs': True,
        'max_log_entries': 10000
    }
    
    # BASE DE DONNÉES
    DATABASE_SETTINGS = {
        'enable_wal_mode': True,      # Mode WAL pour SQLite
        'enable_foreign_keys': True,
        'cache_size': -64000,         # 64MB cache
        'synchronous': 'NORMAL',
        'journal_mode': 'WAL',
        'temp_store': 'MEMORY'
    }
    
    # SÉCURITÉ
    SECURITY_SETTINGS = {
        'bcrypt_rounds': 12,          # Coût bcrypt pour mots de passe
        'session_timeout': 3600,     # Timeout session en secondes
        'max_failed_attempts': 5,
        'lockout_duration': 300      # Durée blocage en secondes
    }
    
    @classmethod
    def ensure_directories(cls):
        """Crée tous les dossiers nécessaires"""
        directories = [
            cls.PDF_DIR,  
            cls.INDEXES_DIR, 
            cls.CACHE_DIR,
            cls.BASE_DIR / "logs"
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        
        print(f"✅ Dossiers créés/vérifiés: {len(directories)}")
    
    @classmethod
    def get_database_url(cls):
        """Retourne l'URL de connexion à la base de données"""
        return f"sqlite:///{cls.DB_PATH}"
    
    @classmethod
    def get_embedding_cache_path(cls):
        """Chemin du cache des embeddings"""
        return cls.CACHE_DIR / "embeddings_cache.db"
    
    @classmethod
    def get_faiss_index_path(cls, index_name="default"):
        """Chemin de l'index FAISS"""
        return cls.INDEXES_DIR / f"{index_name}.faiss"

# Configuration par défaut pour l'environnement
def setup_environment():
    """Configure l'environnement MuseumVoice"""
    MuseumVoiceConfig.ensure_directories()
    return MuseumVoiceConfig

# Raccourcis pour accès rapide
CONFIG = MuseumVoiceConfig