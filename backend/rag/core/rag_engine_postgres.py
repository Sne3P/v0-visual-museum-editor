"""
RAG Engine pour PostgreSQL avec FAISS et Embeddings
Système complet: Chunks → Embeddings → FAISS → Recherche sémantique
"""

import hashlib
import json
import pickle
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
    print("✅ sentence-transformers disponible")
except ImportError as e:
    print(f"⚠️  sentence-transformers non disponible: {e}")
    print("   → pip install sentence-transformers")
    SENTENCE_TRANSFORMERS_AVAILABLE = False

try:
    import faiss
    FAISS_AVAILABLE = True
    print("✅ FAISS disponible")
except ImportError as e:
    print(f"⚠️  FAISS non disponible: {e}")
    print("   → pip install faiss-cpu")
    FAISS_AVAILABLE = False

from rag.core.db_postgres import (
    _connect_postgres, get_artwork, get_all_artworks,
    get_artwork_chunks
)


class PostgresRAGEngine:
    """
    Moteur RAG complet pour PostgreSQL
    Flux: PDF → Chunks → Embeddings → FAISS Index → Recherche sémantique → LLM
    """
    
    def __init__(self, 
                 model_name: str = "all-MiniLM-L6-v2",
                 index_name: str = "museum_postgres"):
        self.model_name = model_name
        self.index_name = index_name
        
        self._model = None
        self._index = None
        self._chunk_mapping = {}  # mapping FAISS_ID → chunk_id
        
        # Dossier pour sauvegarder les index FAISS
        self._index_path = Path(__file__).parent.parent / "indexes" / index_name
        self._index_path.mkdir(parents=True, exist_ok=True)
        
        print(f"📦 RAG Engine initialisé: {model_name}")
        print(f"📁 Index path: {self._index_path}")
    
    @property
    def model(self):
        """Lazy loading du modèle d'embeddings"""
        if self._model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
            print(f"🔄 Chargement du modèle: {self.model_name}...")
            self._model = SentenceTransformer(self.model_name)
            print(f"✅ Modèle chargé (dimension: {self._model.get_sentence_embedding_dimension()})")
        return self._model
    
    def create_embeddings_for_artwork(self, oeuvre_id: int) -> Dict[str, Any]:
        """
        Crée les embeddings pour tous les chunks d'une œuvre
        
        Returns:
            {
                'oeuvre_id': int,
                'chunks_processed': int,
                'embeddings_created': int,
                'dimension': int
            }
        """
        if not self.model:
            raise RuntimeError("Modèle d'embeddings non disponible")
        
        # Récupérer tous les chunks de l'œuvre
        chunks = get_artwork_chunks(oeuvre_id)
        
        if not chunks:
            return {
                'oeuvre_id': oeuvre_id,
                'chunks_processed': 0,
                'embeddings_created': 0,
                'error': 'Aucun chunk trouvé'
            }
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        embeddings_created = 0
        
        try:
            for chunk in chunks:
                chunk_id = chunk['chunk_id']
                chunk_text = chunk['chunk_text']
                
                # Vérifier si embedding existe déjà
                cur.execute(
                    "SELECT embedding_id FROM embeddings WHERE chunk_id = %s AND model_name = %s",
                    (chunk_id, self.model_name)
                )
                
                if cur.fetchone():
                    continue  # Embedding déjà existant
                
                # Créer l'embedding
                embedding_vector = self.model.encode(chunk_text, convert_to_numpy=True)
                
                # Normaliser pour cosine similarity
                faiss.normalize_L2(embedding_vector.reshape(1, -1))
                
                # Sauvegarder en base
                cur.execute("""
                    INSERT INTO embeddings (
                        chunk_id, embedding_vector, model_name, 
                        vector_dimension, created_at
                    ) VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                """, (
                    chunk_id,
                    pickle.dumps(embedding_vector),
                    self.model_name,
                    int(embedding_vector.shape[0])
                ))
                
                embeddings_created += 1
            
            conn.commit()
            
            return {
                'success': True,
                'oeuvre_id': oeuvre_id,
                'chunks_processed': len(chunks),
                'embeddings_created': embeddings_created,
                'dimension': self.model.get_sentence_embedding_dimension()
            }
            
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cur.close()
            conn.close()
    
    def build_faiss_index_for_artwork(self, oeuvre_id: int) -> Dict[str, Any]:
        """
        Construit un index FAISS pour une œuvre spécifique
        """
        if not FAISS_AVAILABLE:
            raise RuntimeError("FAISS non disponible")
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        try:
            # Récupérer tous les embeddings de l'œuvre
            cur.execute("""
                SELECT e.embedding_id, e.chunk_id, e.embedding_vector, e.vector_dimension
                FROM embeddings e
                JOIN chunk c ON e.chunk_id = c.chunk_id
                WHERE c.oeuvre_id = %s AND e.model_name = %s
                ORDER BY c.chunk_index
            """, (oeuvre_id, self.model_name))
            
            rows = cur.fetchall()
            
            if not rows:
                return {
                    'oeuvre_id': oeuvre_id,
                    'index_size': 0,
                    'error': 'Aucun embedding trouvé'
                }
            
            # Charger tous les vecteurs
            vectors = []
            chunk_ids = []
            
            for row in rows:
                vector = pickle.loads(row['embedding_vector'])
                vectors.append(vector)
                chunk_ids.append(row['chunk_id'])
            
            vectors_array = np.vstack(vectors).astype('float32')
            dimension = int(rows[0]['vector_dimension'])
            
            # Créer l'index FAISS
            index = faiss.IndexFlatIP(dimension)  # Inner Product pour cosine similarity
            index.add(vectors_array)
            
            # Sauvegarder l'index
            index_file = self._index_path / f"artwork_{oeuvre_id}.faiss"
            mapping_file = self._index_path / f"artwork_{oeuvre_id}.mapping"
            
            faiss.write_index(index, str(index_file))
            
            # Sauvegarder le mapping FAISS_ID → chunk_id
            chunk_mapping = {i: chunk_id for i, chunk_id in enumerate(chunk_ids)}
            with open(mapping_file, 'wb') as f:
                pickle.dump(chunk_mapping, f)
            
            return {
                'success': True,
                'oeuvre_id': oeuvre_id,
                'index_size': len(chunk_ids),
                'chunks_indexed': len(chunk_ids),
                'dimension': dimension,
                'index_file': str(index_file),
                'mapping_file': str(mapping_file)
            }
            
        finally:
            cur.close()
            conn.close()
    
    def search_similar_chunks(self, 
                            query: str, 
                            oeuvre_id: Optional[int] = None,
                            top_k: int = 5,
                            threshold: float = 0.3) -> List[Dict[str, Any]]:
        """
        Recherche de chunks similaires via FAISS
        
        Args:
            query: Texte de recherche
            oeuvre_id: ID de l'œuvre (si None, recherche globale)
            top_k: Nombre de résultats max
            threshold: Score minimal de similarité
        
        Returns:
            Liste de chunks avec scores de similarité
        """
        if not self.model or not FAISS_AVAILABLE:
            raise RuntimeError("Modèle ou FAISS non disponible")
        
        # Créer embedding de la requête
        query_vector = self.model.encode(query, convert_to_numpy=True)
        query_vector = query_vector.reshape(1, -1).astype('float32')
        faiss.normalize_L2(query_vector)
        
        if oeuvre_id:
            # Recherche dans l'index d'une œuvre spécifique
            return self._search_in_artwork_index(oeuvre_id, query_vector, top_k, threshold)
        else:
            # Recherche globale dans toutes les œuvres
            return self._search_in_global_index(query_vector, top_k, threshold)
    
    def _search_in_artwork_index(self, oeuvre_id: int, query_vector: np.ndarray,
                                top_k: int, threshold: float) -> List[Dict[str, Any]]:
        """Recherche dans l'index d'une œuvre spécifique"""
        
        index_file = self._index_path / f"artwork_{oeuvre_id}.faiss"
        mapping_file = self._index_path / f"artwork_{oeuvre_id}.mapping"
        
        if not index_file.exists():
            print(f"⚠️  Index non trouvé pour œuvre {oeuvre_id}")
            return []
        
        # Charger l'index
        index = faiss.read_index(str(index_file))
        with open(mapping_file, 'rb') as f:
            chunk_mapping = pickle.load(f)
        
        # Rechercher
        scores, indices = index.search(query_vector, min(top_k, index.ntotal))
        
        # Récupérer les détails des chunks
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or score < threshold:
                continue
            
            chunk_id = chunk_mapping[idx]
            chunk_details = self._get_chunk_details(chunk_id)
            
            if chunk_details:
                results.append({
                    **chunk_details,
                    'similarity_score': float(score),
                    'rank': len(results) + 1
                })
        
        return results
    
    def _search_in_global_index(self, query_vector: np.ndarray,
                               top_k: int, threshold: float) -> List[Dict[str, Any]]:
        """Recherche globale dans toutes les œuvres"""
        
        # Charger ou créer l'index global
        if self._index is None:
            self._load_global_index()
        
        if self._index is None or self._index.ntotal == 0:
            print("⚠️  Index global vide")
            return []
        
        # Rechercher
        scores, indices = index.search(query_vector, min(top_k, self._index.ntotal))
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or score < threshold:
                continue
            
            chunk_id = self._chunk_mapping.get(idx)
            if chunk_id:
                chunk_details = self._get_chunk_details(chunk_id)
                if chunk_details:
                    results.append({
                        **chunk_details,
                        'similarity_score': float(score),
                        'rank': len(results) + 1
                    })
        
        return results
    
    def _get_chunk_details(self, chunk_id: int) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un chunk"""
        conn = _connect_postgres()
        cur = conn.cursor()
        
        try:
            cur.execute("""
                SELECT c.*, o.title, o.artist
                FROM chunk c
                JOIN oeuvres o ON c.oeuvre_id = o.oeuvre_id
                WHERE c.chunk_id = %s
            """, (chunk_id,))
            
            row = cur.fetchone()
            
            if row:
                return {
                    'chunk_id': row['chunk_id'],
                    'oeuvre_id': row['oeuvre_id'],
                    'chunk_text': row['chunk_text'],
                    'chunk_index': row['chunk_index'],
                    'artwork_title': row['title'],
                    'artist': row['artist']
                }
            return None
            
        finally:
            cur.close()
            conn.close()
    
    def _load_global_index(self):
        """Charge l'index global de toutes les œuvres"""
        global_index_file = self._index_path / "global.faiss"
        global_mapping_file = self._index_path / "global.mapping"
        
        if global_index_file.exists() and global_mapping_file.exists():
            self._index = faiss.read_index(str(global_index_file))
            with open(global_mapping_file, 'rb') as f:
                self._chunk_mapping = pickle.load(f)
            print(f"📁 Index global chargé: {self._index.ntotal} chunks")
        else:
            print("⚠️  Index global non trouvé - créez-le avec build_global_index()")
    
    def build_global_index(self) -> Dict[str, Any]:
        """Construit un index FAISS global pour toutes les œuvres"""
        
        if not FAISS_AVAILABLE:
            raise RuntimeError("FAISS non disponible")
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        try:
            # Récupérer tous les embeddings
            cur.execute("""
                SELECT e.embedding_id, e.chunk_id, e.embedding_vector, e.vector_dimension
                FROM embeddings e
                WHERE e.model_name = %s
                ORDER BY e.chunk_id
            """, (self.model_name,))
            
            rows = cur.fetchall()
            
            if not rows:
                return {
                    'index_size': 0,
                    'error': 'Aucun embedding trouvé'
                }
            
            # Charger tous les vecteurs
            vectors = []
            chunk_ids = []
            
            for row in rows:
                vector = pickle.loads(row['embedding_vector'])
                vectors.append(vector)
                chunk_ids.append(row['chunk_id'])
            
            vectors_array = np.vstack(vectors).astype('float32')
            dimension = int(rows[0]['vector_dimension'])
            
            # Créer l'index FAISS global
            self._index = faiss.IndexFlatIP(dimension)
            self._index.add(vectors_array)
            
            # Créer le mapping
            self._chunk_mapping = {i: chunk_id for i, chunk_id in enumerate(chunk_ids)}
            
            # Sauvegarder
            global_index_file = self._index_path / "global.faiss"
            global_mapping_file = self._index_path / "global.mapping"
            
            faiss.write_index(self._index, str(global_index_file))
            with open(global_mapping_file, 'wb') as f:
                pickle.dump(self._chunk_mapping, f)
            
            print(f"✅ Index global créé: {len(chunk_ids)} chunks indexés")
            
            return {
                'index_size': len(chunk_ids),
                'dimension': dimension,
                'index_file': str(global_index_file),
                'chunk_count': len(chunk_ids)
            }
            
        finally:
            cur.close()
            conn.close()


# Instance globale
_rag_engine = None

def get_rag_engine() -> PostgresRAGEngine:
    """Singleton pour RAG Engine"""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = PostgresRAGEngine()
    return _rag_engine
