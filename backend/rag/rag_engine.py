"""
Module RAG optimisé avec FAISS et cache SQLite
"""

import hashlib
import json
import pickle
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

from db import (_connect, add_chunk, get_chunks_by_oeuvre, add_embedding, 
               get_embedding)


class RAGEngine:
    """Moteur RAG optimisé avec cache SQLite et FAISS"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", 
                 chunk_size: int = 500, chunk_overlap: int = 50,
                 index_name: str = "default", db_path: Optional[str] = None):
        self.model_name = model_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.index_name = index_name
        self.db_path = db_path
        
        self._model = None
        self._index = None
        self._chunk_id_mapping = {}
    
    @property
    def model(self):
        """Lazy loading du modèle d'embeddings"""
        if self._model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
            print(f"Loading embedding model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
        return self._model
    
    def _get_content_hash(self, content: str) -> str:
        """Génère un hash unique pour le contenu"""
        return hashlib.md5(content.encode('utf-8')).hexdigest()
    
    def split_document(self, oeuvre_id: int, content: str, 
                       metadata: Optional[Dict] = None) -> List[int]:
        """Découpe une œuvre en chunks intelligents qui respectent les phrases"""
        chunks = self._smart_chunk_text(content)
        
        chunk_ids = []
        print(f"Splitting document {oeuvre_id} into {len(chunks)} chunks")
        
        # Calculer les positions séquentielles sans gaps
        current_pos = 0
        
        for i, chunk_content in enumerate(chunks):
            # Inclure oeuvre_id et chunk_index pour garantir l'unicité
            content_hash = self._get_content_hash(f"{oeuvre_id}_{i}_{chunk_content}")
            
            # Positions consécutives sans gaps
            chunk_start = current_pos
            chunk_end = current_pos + len(chunk_content) - 1
            
            chunk_metadata = {
                "chunk_size": len(chunk_content),
                "original_oeuvre_id": oeuvre_id,
                "processing_method": "sequential_no_gaps",
                **(metadata or {})
            }
            
            chunk_id = add_chunk(
                oeuvre_id=oeuvre_id,
                chunk_index=i,
                content=chunk_content,
                content_hash=content_hash,
                token_count=len(chunk_content.split()),
                start_char=chunk_start,
                end_char=chunk_end,
                metadata=json.dumps(chunk_metadata),
                db_path=self.db_path
            )
            
            if chunk_id:
                chunk_ids.append(chunk_id)
                
            # Position suivante = fin du chunk actuel + 1
            current_pos = chunk_end + 1
        
        return chunk_ids
    
    def embed_chunks(self, chunk_ids: List[int], force_recompute: bool = False) -> np.ndarray:
        """Calcule ou récupère les embeddings des chunks depuis le cache BDD"""
        if not self.model:
            print("Warning: Sentence transformers not available, using dummy embeddings")
            return np.random.rand(len(chunk_ids), 384).astype(np.float32)
        
        embeddings = []
        chunks_to_embed = []
        chunk_contents = []
        
        # Récupérer chunks et vérifier cache
        conn = _connect(self.db_path)
        cur = conn.cursor()
        
        for chunk_id in chunk_ids:
            cur.execute("SELECT chunk_text FROM Chunk WHERE chunk_id = ?", (chunk_id,))
            chunk_row = cur.fetchone()
            
            if not chunk_row:
                continue
            
            chunk_content = chunk_row[0]
            
            # Vérifier cache
            if not force_recompute:
                cached_embedding = get_embedding(chunk_id, self.model_name, self.db_path)
                if cached_embedding:
                    embedding = pickle.loads(cached_embedding)
                    embeddings.append(embedding)
                    continue
            
            chunks_to_embed.append(chunk_id)
            chunk_contents.append(chunk_content)
        
        conn.close()
        
        # Calculer embeddings manquants
        if chunks_to_embed:
            print(f"Computing embeddings for {len(chunks_to_embed)} chunks")
            new_embeddings = self.model.encode(chunk_contents, normalize_embeddings=True)
            
            # Sauvegarder en cache
            for i, chunk_id in enumerate(chunks_to_embed):
                embedding_bytes = pickle.dumps(new_embeddings[i])
                add_embedding(
                    chunk_id=chunk_id,
                    model_name=self.model_name,
                    embedding_vector=embedding_bytes,
                    vector_dimension=new_embeddings[i].shape[0],
                    db_path=self.db_path
                )
                embeddings.append(new_embeddings[i])
        
        return np.array(embeddings) if embeddings else np.array([])
    
    def build_faiss_index(self, oeuvre_ids: List[int]) -> str:
        """Construit un index FAISS pour les œuvres données"""
        if not FAISS_AVAILABLE:
            print("Warning: FAISS not available, skipping index creation")
            return ""
        
        # Récupérer tous les chunks
        all_chunk_ids = []
        for oeuvre_id in oeuvre_ids:
            chunks = get_chunks_by_oeuvre(oeuvre_id, self.db_path)
            all_chunk_ids.extend([chunk['chunk_id'] for chunk in chunks])
        
        if not all_chunk_ids:
            print(f"No chunks found for oeuvres: {oeuvre_ids}")
            # Vérifier œuvre par œuvre
            for oeuvre_id in oeuvre_ids:
                chunks = get_chunks_by_oeuvre(oeuvre_id, self.db_path)
                print(f"  Oeuvre {oeuvre_id}: {len(chunks)} chunks")
            raise ValueError("No chunks found for given oeuvres")
        
        print(f"Building FAISS index for {len(all_chunk_ids)} chunks")
        
        # Calculer embeddings
        embeddings = self.embed_chunks(all_chunk_ids)
        
        if embeddings.size == 0:
            raise ValueError("No embeddings computed")
        
        # Créer index FAISS
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        index.add(embeddings.astype(np.float32))
        
        # Sauvegarder
        index_filename = f"{self.index_name}_{self.model_name}.faiss"
        index_path = Path(__file__).parent / "indexes" / index_filename
        index_path.parent.mkdir(exist_ok=True)
        
        faiss.write_index(index, str(index_path))
        
        # Sauvegarder mapping
        mapping_path = index_path.with_suffix('.mapping')
        chunk_id_mapping = {i: chunk_id for i, chunk_id in enumerate(all_chunk_ids)}
        with open(mapping_path, 'wb') as f:
            pickle.dump(chunk_id_mapping, f)
        
        self._chunk_id_mapping = chunk_id_mapping
        self._index = index
        
        print(f"FAISS index saved to {index_path}")
        return str(index_path)
    
    def search(self, query: str, top_k: int = 5, 
               session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Recherche les chunks les plus similaires à la requête"""
        start_time = time.time()
        
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Charger automatiquement l'index s'il n'est pas chargé
        if not self._index:
            self._load_index()
        
        if not self._index or not self.model:
            print("Warning: Index or model not available, returning empty results")
            return []
        
        # Encoder la requête
        query_embedding = self.model.encode([query], normalize_embeddings=True)
        
        # Recherche
        scores, indices = self._index.search(query_embedding.astype(np.float32), top_k)
        
        # Récupérer chunks
        results = []
        chunk_ids = []
        
        for i, (score, idx) in enumerate(zip(scores[0], indices[0])):
            if idx in self._chunk_id_mapping:
                chunk_id = self._chunk_id_mapping[idx]
                chunk_ids.append(chunk_id)
                results.append({
                    'chunk_id': chunk_id,
                    'score': float(score),
                    'rank': i + 1
                })
        
        # Enrichir avec contenu
        if chunk_ids:
            conn = _connect(self.db_path)
            cur = conn.cursor()
            
            placeholders = ','.join(['?'] * len(chunk_ids))
            cur.execute(
                f"""SELECT c.*, o.title, o.file_name 
                   FROM Chunk c 
                   JOIN Oeuvres o ON c.oeuvre_id = o.oeuvre_id 
                   WHERE c.chunk_id IN ({placeholders})""",
                chunk_ids
            )
            
            chunk_data = {row['chunk_id']: dict(row) for row in cur.fetchall()}
            conn.close()
            
            for result in results:
                chunk_id = result['chunk_id']
                if chunk_id in chunk_data:
                    result.update(chunk_data[chunk_id])
        
        # Logger session (fonction optionnelle)
        search_time_ms = int((time.time() - start_time) * 1000)
        
        return results
    
    def _smart_chunk_text(self, text: str) -> List[str]:
        """
        Découpe intelligemment le texte en respectant les phrases
        """
        import re
        
        # Nettoyer le texte
        text = text.strip()
        if not text:
            return []
        
        # Séparer en phrases avec regex améliorée
        sentence_endings = re.compile(r'[.!?]+\s+(?=[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ])')
        sentences = sentence_endings.split(text)
        
        if not sentences or len(sentences) < 2:
            # Fallback: découpage par caractères si peu de phrases
            return self._fallback_chunk(text)
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
                
            # Estimer la taille si on ajoute cette phrase
            potential_chunk = current_chunk + " " + sentence if current_chunk else sentence
            
            # Si ça dépasse la taille max
            if len(potential_chunk) > self.chunk_size:
                # Sauvegarder le chunk actuel s'il n'est pas vide
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                
                # Si la phrase seule est trop longue, la découper
                if len(sentence) > self.chunk_size:
                    chunks.extend(self._fallback_chunk(sentence))
                    current_chunk = ""
                else:
                    current_chunk = sentence
            else:
                current_chunk = potential_chunk
        
        # Ajouter le dernier chunk
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        # PAS d'overlap artificiel - les chunks sont déjà cohérents
        return chunks
    
    def _fallback_chunk(self, text: str) -> List[str]:
        """Découpage de secours par caractères"""
        chunks = []
        for i in range(0, len(text), self.chunk_size):
            chunk = text[i:i + self.chunk_size]
            if chunk.strip():
                chunks.append(chunk.strip())
        return chunks
    
    def _load_index(self):
        """Charge automatiquement l'index FAISS s'il existe"""
        if not FAISS_AVAILABLE:
            print("FAISS not available for loading index")
            return
            
        try:
            # Chercher l'index existant
            index_filename = f"{self.index_name}_{self.model_name}.faiss"
            index_path = Path(__file__).parent / "indexes" / index_filename
            mapping_path = index_path.with_suffix('.mapping')
            
            if index_path.exists() and mapping_path.exists():
                print(f"Loading existing index: {index_path}")
                self._index = faiss.read_index(str(index_path))
                
                # Charger le mapping
                with open(mapping_path, 'rb') as f:
                    self._chunk_id_mapping = pickle.load(f)
                
                print(f"Index loaded successfully: {len(self._chunk_id_mapping)} chunks")
            else:
                print(f"No existing index found at {index_path} or {mapping_path}")
                
        except Exception as e:
            print(f"Error loading index: {e}")
            print("Will continue without pre-loaded index")
            self._index = None
            self._chunk_id_mapping = {}


def quick_rag_setup(document_contents: List[str], document_ids: List[int],
                    model_name: str = "all-MiniLM-L6-v2",
                    index_name: str = "quick_setup",
                    db_path: Optional[str] = None) -> RAGEngine:
    """Configuration rapide d'un moteur RAG"""
    rag = RAGEngine(
        model_name=model_name,
        index_name=index_name,
        db_path=db_path
    )
    
    # Découper et indexer
    for content, doc_id in zip(document_contents, document_ids):
        chunk_ids = rag.split_document(doc_id, content)
        print(f"Document {doc_id}: {len(chunk_ids)} chunks created")
    
    # Construire index
    rag.build_faiss_index(document_ids)
    
    return rag


if __name__ == "__main__":
    pass