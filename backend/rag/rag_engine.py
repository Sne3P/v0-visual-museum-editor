"""
Module RAG structuré pour les œuvres d'art avec le nouveau modèle de données
"""

import hashlib
import json
import pickle
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

try:
    print("🔄 Chargement de sentence-transformers...")
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
    print("✅ sentence-transformers chargé")
except ImportError as e:
    print(f"⚠️ sentence-transformers non disponible: {e}")
    SENTENCE_TRANSFORMERS_AVAILABLE = False

try:
    import faiss
    FAISS_AVAILABLE = True
    print("✅ FAISS disponible")
except ImportError as e:
    print(f"⚠️ FAISS non disponible: {e}")
    FAISS_AVAILABLE = False

from db import (
    _connect_structured, get_artwork, get_artwork_sections, 
    get_artwork_anecdotes, search_artworks, get_all_artworks
)


class StructuredRAGEngine:
    """Moteur RAG optimisé pour la nouvelle structure d'œuvres d'art"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", 
                 index_name: str = "structured_artworks", db_path: Optional[str] = None):
        self.model_name = model_name
        self.index_name = index_name
        # Utiliser la base museum_v1.db migrée
        if db_path:
            self.db_path = db_path
        else:
            backend_dir = Path(__file__).parent
            self.db_path = str(backend_dir.parent / "database" / "museum_v1.db")
        
        self._model = None
        self._index = None
        self._entity_mapping = {}  # mapping ID FAISS -> (entity_type, entity_id)
        self._index_path = Path(__file__).parent / "indexes" / f"{index_name}_{model_name}"
        self._index_path.mkdir(parents=True, exist_ok=True)
    
    @property
    def model(self):
        """Lazy loading du modèle d'embeddings"""
        if self._model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
            print(f"Loading embedding model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
        return self._model
    
    def _get_content_hash(self, content: str, entity_type: str, entity_id: int) -> str:
        """Génère un hash unique pour le contenu"""
        unique_content = f"{entity_type}_{entity_id}_{content}"
        return hashlib.md5(unique_content.encode('utf-8')).hexdigest()
    
    def _prepare_artwork_for_embedding(self, artwork_id: int) -> List[Tuple[str, str, int]]:
        """
        Prépare les différents éléments d'une œuvre pour l'embedding.
        Retourne: [(text_content, entity_type, entity_id), ...]
        """
        artwork = get_artwork(artwork_id, self.db_path)
        if not artwork:
            return []
        
        embedding_texts = []
        
        # 1. Métadonnées principales de l'œuvre
        metadata_text = self._format_artwork_metadata(artwork)
        embedding_texts.append((metadata_text, "artwork", artwork_id))
        
        # 2. Sections documentaires
        for section in artwork['sections']:
            section_text = f"{section['title'] or section['section_type']}: {section['content']}"
            embedding_texts.append((section_text, "section", section['section_id']))
        
        # 3. Anecdotes
        for anecdote in artwork['anecdotes']:
            anecdote_text = f"Anecdote: {anecdote['content']}"
            embedding_texts.append((anecdote_text, "anecdote", anecdote['anecdote_id']))
        
        return embedding_texts
    
    def _format_artwork_metadata(self, artwork: Dict[str, Any]) -> str:
        """Formate les métadonnées d'une œuvre pour l'embedding"""
        parts = [f"Titre: {artwork['title']}"]
        
        if artwork.get('artist_name'):
            parts.append(f"Artiste: {artwork['artist_name']}")
            if artwork.get('artist_birthplace'):
                parts.append(f"Lieu de naissance: {artwork['artist_birthplace']}")
        
        if artwork.get('artwork_date'):
            parts.append(f"Date: {artwork['artwork_date']}")
        
        if artwork.get('materials_technique'):
            parts.append(f"Matériaux/Technique: {artwork['materials_technique']}")
        
        if artwork.get('movement_name'):
            parts.append(f"Mouvement: {artwork['movement_name']}")
            if artwork.get('movement_description'):
                parts.append(f"Description du mouvement: {artwork['movement_description']}")
        
        if artwork.get('provenance'):
            parts.append(f"Provenance: {artwork['provenance']}")
        
        return " | ".join(parts)
    
    def add_artwork_to_index(self, artwork_id: int) -> bool:
        """Ajoute une œuvre complète à l'index FAISS"""
        if not self.model or not FAISS_AVAILABLE:
            print("❌ Modèle ou FAISS non disponible")
            return False
        
        try:
            embedding_texts = self._prepare_artwork_for_embedding(artwork_id)
            if not embedding_texts:
                print(f"❌ Aucun contenu à indexer pour l'œuvre {artwork_id}")
                return False
            
            # Créer les embeddings
            texts = [text for text, _, _ in embedding_texts]
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            
            # Initialiser l'index si nécessaire
            if self._index is None:
                self._load_or_create_index(embeddings.shape[1])
            
            # Ajouter à l'index FAISS
            start_id = len(self._entity_mapping)
            self._index.add(embeddings)
            
            # Mettre à jour le mapping
            for i, (text, entity_type, entity_id) in enumerate(embedding_texts):
                faiss_id = start_id + i
                self._entity_mapping[faiss_id] = (entity_type, entity_id)
                
                # Sauvegarder l'embedding en base
                self._save_embedding_to_db(entity_type, entity_id, text, embeddings[i])
            
            # Sauvegarder l'index
            self._save_index()
            
            print(f"✅ Œuvre {artwork_id} ajoutée à l'index ({len(embedding_texts)} éléments)")
            return True
            
        except Exception as e:
            print(f"❌ Erreur lors de l'ajout de l'œuvre {artwork_id}: {e}")
            return False
    
    def _save_embedding_to_db(self, entity_type: str, entity_id: int, 
                             text_content: str, embedding_vector: np.ndarray):
        """Sauvegarde un embedding en base de données"""
        conn = _connect_structured(self.db_path)
        cur = conn.cursor()
        
        # Vérifier si l'embedding existe déjà
        cur.execute(
            "SELECT embedding_id FROM structured_embeddings WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id)
        )
        existing = cur.fetchone()
        
        if not existing:
            cur.execute(
                """INSERT INTO structured_embeddings 
                   (entity_type, entity_id, text_content, embedding_vector, model_name, vector_dimension) 
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (entity_type, entity_id, text_content, pickle.dumps(embedding_vector), 
                 self.model_name, embedding_vector.shape[0])
            )
            conn.commit()
        
        conn.close()
    
    def _load_or_create_index(self, dimension: int):
        """Charge ou crée l'index FAISS"""
        faiss_file = self._index_path / f"{self.model_name}.faiss"
        mapping_file = self._index_path / f"{self.model_name}.mapping"
        
        if faiss_file.exists() and mapping_file.exists():
            # Charger l'index existant
            self._index = faiss.read_index(str(faiss_file))
            with open(mapping_file, 'rb') as f:
                self._entity_mapping = pickle.load(f)
            print(f"📁 Index chargé: {len(self._entity_mapping)} éléments")
        else:
            # Créer un nouvel index
            self._index = faiss.IndexFlatIP(dimension)  # Inner Product pour cosine similarity
            self._entity_mapping = {}
            print(f"🆕 Nouvel index créé (dimension: {dimension})")
    
    def _save_index(self):
        """Sauvegarde l'index FAISS et le mapping"""
        faiss_file = self._index_path / f"{self.model_name}.faiss"
        mapping_file = self._index_path / f"{self.model_name}.mapping"
        
        faiss.write_index(self._index, str(faiss_file))
        with open(mapping_file, 'wb') as f:
            pickle.dump(self._entity_mapping, f)
    
    def search_similar_content(self, query: str, top_k: int = 5, 
                             threshold: float = 0.3) -> List[Dict[str, Any]]:
        """
        Recherche de contenu similaire dans l'index structuré.
        Retourne les résultats avec leurs métadonnées complètes.
        """
        if not self.model or not FAISS_AVAILABLE or self._index is None:
            print("❌ Index non disponible")
            return []
        
        try:
            # Créer l'embedding de la requête
            query_embedding = self.model.encode([query], convert_to_numpy=True)
            
            # Normaliser pour cosine similarity
            faiss.normalize_L2(query_embedding)
            
            # Rechercher dans l'index
            scores, indices = self._index.search(query_embedding, top_k)
            
            results = []
            for i, (score, idx) in enumerate(zip(scores[0], indices[0])):
                if idx == -1 or score < threshold:
                    continue
                
                entity_type, entity_id = self._entity_mapping.get(idx, (None, None))
                if entity_type and entity_id:
                    result = {
                        'entity_type': entity_type,
                        'entity_id': entity_id,
                        'similarity_score': float(score),
                        'rank': i + 1
                    }
                    
                    # Ajouter les détails selon le type d'entité
                    if entity_type == 'artwork':
                        artwork = get_artwork(entity_id, self.db_path)
                        if artwork:
                            result.update({
                                'artwork_id': entity_id,
                                'title': artwork['title'],
                                'artist': artwork.get('artist_name'),
                                'content': self._format_artwork_metadata(artwork)
                            })
                    
                    elif entity_type == 'section':
                        section_details = self._get_section_details(entity_id)
                        if section_details:
                            result.update(section_details)
                    
                    elif entity_type == 'anecdote':
                        anecdote_details = self._get_anecdote_details(entity_id)
                        if anecdote_details:
                            result.update(anecdote_details)
                    
                    results.append(result)
            
            return results
            
        except Exception as e:
            print(f"❌ Erreur lors de la recherche: {e}")
            return []
    
    def _get_section_details(self, section_id: int) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une section documentaire"""
        conn = _connect_structured(self.db_path)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT ds.*, a.title as artwork_title, art.name as artist_name
            FROM documentary_sections ds
            JOIN artworks a ON ds.artwork_id = a.artwork_id
            LEFT JOIN artists art ON a.artist_id = art.artist_id
            WHERE ds.section_id = ?
        """, (section_id,))
        
        row = cur.fetchone()
        conn.close()
        
        if row:
            return {
                'section_id': section_id,
                'artwork_id': row['artwork_id'],
                'artwork_title': row['artwork_title'],
                'artist': row['artist_name'],
                'section_type': row['section_type'],
                'title': row['title'],
                'content': row['content']
            }
        return None
    
    def _get_anecdote_details(self, anecdote_id: int) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'une anecdote"""
        conn = _connect_structured(self.db_path)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT an.*, a.title as artwork_title, art.name as artist_name
            FROM anecdotes an
            JOIN artworks a ON an.artwork_id = a.artwork_id
            LEFT JOIN artists art ON a.artist_id = art.artist_id
            WHERE an.anecdote_id = ?
        """, (anecdote_id,))
        
        row = cur.fetchone()
        conn.close()
        
        if row:
            return {
                'anecdote_id': anecdote_id,
                'artwork_id': row['artwork_id'],
                'artwork_title': row['artwork_title'],
                'artist': row['artist_name'],
                'content': row['content'],
                'source': row['source']
            }
        return None
    
    def rebuild_index(self):
        """Reconstruit complètement l'index à partir de la base de données"""
        print("🔄 Reconstruction de l'index structuré...")
        
        # Réinitialiser l'index
        self._index = None
        self._entity_mapping = {}
        
        # Récupérer toutes les œuvres
        artworks = get_all_artworks(self.db_path)
        
        success_count = 0
        for artwork in artworks:
            if self.add_artwork_to_index(artwork['artwork_id']):
                success_count += 1
        
        print(f"✅ Index reconstruit: {success_count}/{len(artworks)} œuvres indexées")
        return success_count == len(artworks)
    
    def generate_structured_response(self, query: str, max_results: int = 3) -> Dict[str, Any]:
        """
        Génère une réponse structurée basée sur la recherche dans l'index.
        Organise les résultats par type d'entité et œuvre.
        """
        results = self.search_similar_content(query, top_k=max_results * 3)
        
        if not results:
            return {
                'query': query,
                'results_found': 0,
                'artworks': [],
                'response': "Aucune information pertinente trouvée pour cette requête."
            }
        
        # Organiser les résultats par œuvre
        artworks_data = {}
        
        for result in results:
            artwork_id = result.get('artwork_id')
            if artwork_id and artwork_id not in artworks_data:
                artwork_data = get_artwork(artwork_id, self.db_path)
                if artwork_data:
                    artworks_data[artwork_id] = {
                        'artwork': artwork_data,
                        'sections': [],
                        'anecdotes': [],
                        'metadata_score': 0
                    }
            
            if artwork_id in artworks_data:
                if result['entity_type'] == 'artwork':
                    artworks_data[artwork_id]['metadata_score'] = result['similarity_score']
                elif result['entity_type'] == 'section':
                    artworks_data[artwork_id]['sections'].append(result)
                elif result['entity_type'] == 'anecdote':
                    artworks_data[artwork_id]['anecdotes'].append(result)
        
        # Limiter aux meilleures œuvres
        sorted_artworks = sorted(
            artworks_data.items(), 
            key=lambda x: max(x[1]['metadata_score'], 
                             max([s['similarity_score'] for s in x[1]['sections']] + [0]),
                             max([a['similarity_score'] for a in x[1]['anecdotes']] + [0])),
            reverse=True
        )[:max_results]
        
        # Générer la réponse
        response_parts = []
        final_artworks = []
        
        for artwork_id, data in sorted_artworks:
            artwork = data['artwork']
            final_artworks.append(artwork)
            
            artwork_text = f"**{artwork['title']}**"
            if artwork.get('artist_name'):
                artwork_text += f" par {artwork['artist_name']}"
            
            response_parts.append(artwork_text)
            
            # Ajouter les sections pertinentes
            for section in data['sections'][:2]:  # Max 2 sections par œuvre
                response_parts.append(f"- {section['title']}: {section['content'][:200]}...")
            
            # Ajouter les anecdotes pertinentes
            for anecdote in data['anecdotes'][:1]:  # Max 1 anecdote par œuvre
                response_parts.append(f"- Anecdote: {anecdote['content'][:150]}...")
        
        return {
            'query': query,
            'results_found': len(final_artworks),
            'artworks': final_artworks,
            'response': "\n\n".join(response_parts) if response_parts else "Aucune information pertinente trouvée."
        }


if __name__ == "__main__":
    # Test du moteur RAG structuré
    engine = StructuredRAGEngine()
    print("Moteur RAG structuré initialisé")