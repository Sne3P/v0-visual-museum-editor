#!/usr/bin/env python3
"""
Système COMPLET de prégénération avec Ollama FACTUEL
Flux: Chunks → Embeddings → FAISS → RAG → Ollama Factuel → Narrations uniques
OPTIMISÉ: Parallélisation multi-cœurs avec ThreadPoolExecutor
"""

import sys
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing

# Imports relatifs au package rag
from rag.core.ollama_generator_improved import get_factual_generator as get_ollama_generator
from rag.core.rag_engine_postgres import get_rag_engine
from rag.core.db_postgres import get_artwork, get_all_artworks, get_artwork_chunks
from rag.core.pregeneration_db import add_pregeneration


class OllamaPregenerationSystem:
    """
    Système COMPLET de prégénération avec Ollama
    Gère tout le flux: RAG setup → Génération LLM → Sauvegarde
    """
    
    def __init__(self):
        self.ollama_gen = get_ollama_generator()
        self.rag_engine = get_rag_engine()
        
        # Vérifier Ollama au démarrage
        if not self.ollama_gen.check_ollama_available():
            print("⚠️  ATTENTION: Ollama non disponible - Fallback automatique activé")
        
        # Critères de génération (36 combinaisons)
        self.ages = ['enfant', 'ado', 'adulte', 'senior']
        self.themes = ['technique_picturale', 'biographie', 'historique']
        self.styles = ['analyse', 'decouverte', 'anecdote']
        
        print("🚀 OllamaPregenerationSystem initialisé")
        print(f"   Combinaisons: {len(self.ages) * len(self.themes) * len(self.styles)} par œuvre")
    
    def pregenerate_artwork(self, 
                          oeuvre_id: int, 
                          force_regenerate: bool = False,
                          skip_rag_setup: bool = False) -> Dict[str, Any]:
        """
        Prégénère les 36 narrations pour une œuvre
        Flux COMPLET: RAG setup → 36 générations Ollama
        """
        
        start_time = time.time()
        
        print(f"\n{'='*80}")
        print(f"🎨 PRÉGÉNÉRATION ŒUVRE ID {oeuvre_id}")
        print(f"{'='*80}")
        
        # 1. RÉCUPÉRER L'ŒUVRE
        artwork = get_artwork(oeuvre_id)
        if not artwork:
            return {
                'success': False,
                'error': f"Œuvre {oeuvre_id} non trouvée"
            }
        
        title = artwork.get('title', f'ID {oeuvre_id}')
        print(f"📖 Œuvre: {title}")
        
        # 2. SETUP RAG (TOUJOURS régénérer - c'est rapide)
        print("\n🔧 ÉTAPE 1/3: Configuration RAG (Embeddings + FAISS)")
        
        if not skip_rag_setup:
            print("   🔄 Régénération RAG...")
            setup_result = self._setup_rag_for_artwork(oeuvre_id)
            
            if not setup_result['success']:
                print(f"   ❌ Échec setup RAG: {setup_result.get('error')}")
                print("   ⚠️  Continuer avec fallback")
            else:
                print(f"   ✅ RAG configuré avec succès")
        else:
            print("   ⏭️  Configuration RAG ignorée (skip_rag_setup=True)")
        
        # 3. RÉCUPÉRER CHUNKS ET CONTEXTE RAG
        print("\n📚 ÉTAPE 2/3: Récupération contexte RAG")
        chunks = get_artwork_chunks(oeuvre_id)
        print(f"   Chunks disponibles: {len(chunks)}")
        
        # Créer un contexte RAG global pour l'œuvre
        rag_context = self._build_artwork_rag_context(oeuvre_id, chunks)
        print(f"   Contexte RAG: {len(rag_context)} caractères")
        
        # 4. GÉNÉRATION DES 36 NARRATIONS SÉQUENTIEL OPTIMISÉ
        print(f"\n🤖 ÉTAPE 3/3: Génération Ollama SÉQUENTIEL (36 narrations, CPU max)")
        
        stats = {
            'generated': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0
        }
        
        total_combinations = len(self.ages) * len(self.themes) * len(self.styles)
        current = 0
        
        for age in self.ages:
            for theme in self.themes:
                for style in self.styles:
                    current += 1
                    
                    # Vérifier si existe déjà
                    if not force_regenerate:
                        existing = self._check_existing(oeuvre_id, age, theme, style)
                        if existing:
                            stats['skipped'] += 1
                            continue
                    
                    print(f"   [{current}/{total_combinations}] {age}-{theme}-{style}...", end=' ', flush=True)
                    
                    try:
                        # GÉNÉRATION AVEC OLLAMA (toutes ressources CPU)
                        narration = self.ollama_gen.generate_narration(
                            artwork=artwork,
                            chunks=chunks,
                            rag_context=rag_context,
                            age_cible=age,
                            thematique=theme,
                            style_texte=style
                        )
                        
                        if not narration or len(narration) < 30:
                            print("❌ Vide")
                            stats['errors'] += 1
                            continue
                        
                        # SAUVEGARDER
                        pregen_id = add_pregeneration(
                            oeuvre_id=oeuvre_id,
                            age_cible=age,
                            thematique=theme,
                            style_texte=style,
                            pregeneration_text=narration
                        )
                        
                        if pregen_id:
                            if force_regenerate:
                                stats['updated'] += 1
                                print(f"✅ MAJ (ID: {pregen_id})")
                            else:
                                stats['generated'] += 1
                                print(f"✨ OK (ID: {pregen_id})")
                        else:
                            stats['errors'] += 1
                            print("❌ Save")
                        
                    except Exception as e:
                        print(f"❌ {str(e)[:50]}")
                        stats['errors'] += 1
        
        # RÉSUMÉ
        duration = time.time() - start_time
        
        print(f"\n{'='*80}")
        print("📊 RÉSUMÉ PRÉGÉNÉRATION")
        print(f"{'='*80}")
        print(f"✨ Générées: {stats['generated']}")
        print(f"🔄 Mises à jour: {stats['updated']}")
        print(f"⏭️  Ignorées: {stats['skipped']}")
        print(f"❌ Erreurs: {stats['errors']}")
        print(f"⏱️  Durée: {duration:.1f}s")
        
        if stats['generated'] + stats['updated'] > 0:
            speed = (stats['generated'] + stats['updated']) / duration
            print(f"⚡ Vitesse: {speed:.2f} narrations/seconde")
        
        return {
            'success': True,
            'oeuvre_id': oeuvre_id,
            'title': title,
            'stats': stats,
            'duration': duration
        }
    
    def pregenerate_all_artworks(self, force_regenerate: bool = False) -> Dict[str, Any]:
        """
        Prégénère pour TOUTES les œuvres
        """
        
        print("\n" + "="*80)
        print("🎨 PRÉGÉNÉRATION GLOBALE - TOUTES LES ŒUVRES")
        print("="*80)
        
        start_time = time.time()
        
        # Récupérer toutes les œuvres
        artworks = get_all_artworks()
        
        if not artworks:
            return {
                'success': False,
                'error': 'Aucune œuvre trouvée'
            }
        
        print(f"📚 {len(artworks)} œuvre(s) à traiter")
        
        global_stats = {
            'artworks_processed': 0,
            'artworks_failed': 0,
            'total_generated': 0,
            'total_updated': 0,
            'total_skipped': 0,
            'total_errors': 0
        }
        
        # Traiter chaque œuvre
        for i, artwork in enumerate(artworks, 1):
            oeuvre_id = artwork.get('oeuvre_id')
            title = artwork.get('title', f'ID {oeuvre_id}')
            
            print(f"\n[{i}/{len(artworks)}] Traitement: {title}")
            
            try:
                result = self.pregenerate_artwork(
                    oeuvre_id=oeuvre_id,
                    force_regenerate=force_regenerate,
                    skip_rag_setup=False  # Setup RAG pour chaque œuvre
                )
                
                if result.get('success'):
                    global_stats['artworks_processed'] += 1
                    stats = result.get('stats', {})
                    global_stats['total_generated'] += stats.get('generated', 0)
                    global_stats['total_updated'] += stats.get('updated', 0)
                    global_stats['total_skipped'] += stats.get('skipped', 0)
                    global_stats['total_errors'] += stats.get('errors', 0)
                else:
                    global_stats['artworks_failed'] += 1
                    
            except Exception as e:
                print(f"❌ Erreur œuvre {oeuvre_id}: {e}")
                global_stats['artworks_failed'] += 1
        
        # RÉSUMÉ GLOBAL
        duration = time.time() - start_time
        
        print("\n" + "="*80)
        print("🎉 PRÉGÉNÉRATION GLOBALE TERMINÉE")
        print("="*80)
        print(f"🎨 Œuvres traitées: {global_stats['artworks_processed']}/{len(artworks)}")
        print(f"❌ Œuvres échouées: {global_stats['artworks_failed']}")
        print(f"\n📊 Narrations:")
        print(f"   ✨ Générées: {global_stats['total_generated']}")
        print(f"   🔄 Mises à jour: {global_stats['total_updated']}")
        print(f"   ⏭️  Ignorées: {global_stats['total_skipped']}")
        print(f"   ❌ Erreurs: {global_stats['total_errors']}")
        print(f"\n⏱️  Durée totale: {duration:.1f}s ({duration/60:.1f} min)")
        
        return {
            'success': True,
            'stats': global_stats,
            'duration': duration
        }
    
    def _check_rag_status(self, oeuvre_id: int) -> Dict[str, Any]:
        """
        Vérifie si le RAG est déjà configuré pour cette œuvre
        """
        from rag.core.db_postgres import _connect_postgres
        from pathlib import Path
        
        status = {
            'embeddings_exist': False,
            'embeddings_count': 0,
            'faiss_exist': False
        }
        
        try:
            # Vérifier embeddings en BDD
            conn = _connect_postgres()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) as count FROM embeddings e
                JOIN chunk c ON e.chunk_id = c.chunk_id
                WHERE c.oeuvre_id = %s
            """, (oeuvre_id,))
            result = cursor.fetchone()
            count = result['count'] if result else 0
            cursor.close()
            conn.close()
            
            if count > 0:
                status['embeddings_exist'] = True
                status['embeddings_count'] = count
            
            # Vérifier index FAISS sur disque
            index_path = Path(f"/app/rag/indexes/museum_postgres/artwork_{oeuvre_id}.faiss")
            mapping_path = Path(f"/app/rag/indexes/museum_postgres/artwork_{oeuvre_id}.mapping")
            
            if index_path.exists() and mapping_path.exists():
                status['faiss_exist'] = True
                
        except Exception as e:
            print(f"⚠️  Erreur vérification RAG: {e}")
        
        return status
    
    def _setup_rag_for_artwork(self, oeuvre_id: int) -> Dict[str, Any]:
        """
        Setup complet RAG pour une œuvre:
        0. Créer chunks sémantiques
        1. Créer embeddings
        2. Construire index FAISS
        """
        
        try:
            # 0. Créer chunks d'abord!
            from rag.traitement.chunk_creator_postgres import process_artwork_chunks
            
            print("   0️⃣  Création chunks...", end=' ')
            chunk_result = process_artwork_chunks(oeuvre_id)
            
            if not chunk_result.get('success'):
                print(f"❌ {chunk_result.get('error')}")
                return {'success': False, 'error': 'Échec création chunks'}
            
            print(f"✅ {chunk_result.get('chunks_created', 0)} chunks créés")
            
            # 1. Créer embeddings
            print("   1️⃣  Création embeddings...", end=' ')
            emb_result = self.rag_engine.create_embeddings_for_artwork(oeuvre_id)
            
            if not emb_result.get('success'):
                print(f"❌ {emb_result.get('error')}")
                return {'success': False, 'error': 'Échec embeddings'}
            
            print(f"✅ {emb_result.get('embeddings_created', 0)} créés")
            
            # 2. Construire index FAISS
            print("   2️⃣  Construction index FAISS...", end=' ')
            faiss_result = self.rag_engine.build_faiss_index_for_artwork(oeuvre_id)
            
            if not faiss_result.get('success'):
                print(f"❌ {faiss_result.get('error')}")
                return {'success': False, 'error': 'Échec FAISS'}
            
            print(f"✅ {faiss_result.get('chunks_indexed', 0)} chunks indexés")
            
            return {'success': True}
            
        except Exception as e:
            print(f"❌ Erreur: {e}")
            return {'success': False, 'error': str(e)}
    
    def _check_rag_status(self, oeuvre_id: int) -> Dict[str, Any]:
        """
        Vérifie si le RAG est déjà configuré pour cette œuvre
        Retourne: embeddings_exist, embeddings_count, faiss_exist
        """
        from pathlib import Path
        
        status = {
            'embeddings_exist': False,
            'embeddings_count': 0,
            'faiss_exist': False
        }
        
        try:
            # Vérifier embeddings en BDD
            from rag.core.db_postgres import _connect_postgres
            conn = _connect_postgres()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) as count FROM embeddings e
                JOIN chunk c ON e.chunk_id = c.chunk_id
                WHERE c.oeuvre_id = %s
            """, (oeuvre_id,))
            result = cursor.fetchone()
            count = result['count'] if result else 0
            cursor.close()
            conn.close()
            
            if count > 0:
                status['embeddings_exist'] = True
                status['embeddings_count'] = count
            
            # Vérifier index FAISS sur disque
            index_path = Path(f"/app/rag/indexes/museum_postgres/artwork_{oeuvre_id}.faiss")
            mapping_path = Path(f"/app/rag/indexes/museum_postgres/artwork_{oeuvre_id}.mapping")
            
            if index_path.exists() and mapping_path.exists():
                status['faiss_exist'] = True
                
        except Exception as e:
            print(f"⚠️  Erreur vérification RAG: {e}")
        
        return status
    
    def _build_artwork_rag_context(self, oeuvre_id: int, chunks: List[Dict]) -> str:
        """
        Construit le contexte RAG pour une œuvre
        Utilise recherche sémantique si FAISS disponible, sinon chunks bruts
        """
        
        try:
            # Essayer recherche RAG sémantique
            results = self.rag_engine.search_similar_chunks(
                query="Informations complètes sur l'œuvre analyse technique biographie contexte",
                oeuvre_id=oeuvre_id,
                top_k=10,
                threshold=0.1  # Seuil bas pour récupérer plus
            )
            
            if results:
                # Combiner résultats RAG
                context_parts = []
                for result in results:
                    chunk_text = result.get('chunk_text', '').strip()
                    if chunk_text:
                        context_parts.append(chunk_text)
                
                return '\n\n'.join(context_parts)
        
        except Exception as e:
            print(f"   ⚠️  RAG search échoué: {e}")
        
        # Fallback: utiliser chunks bruts
        if chunks:
            return '\n\n'.join([c.get('chunk_text', '') for c in chunks[:10]])
        
        return ""
    
    def _generate_single_narration(self, oeuvre_id: int, artwork: Dict, chunks: List[Dict],
                                   rag_context: str, age: str, theme: str, style: str,
                                   force_regenerate: bool) -> Dict[str, Any]:
        """
        Génère UNE narration (thread-safe pour parallélisation)
        Retourne: {'success': bool, 'action': 'generated'|'updated', 'pregen_id': int}
        """
        try:
            # GÉNÉRATION AVEC OLLAMA
            narration = self.ollama_gen.generate_narration(
                artwork=artwork,
                chunks=chunks,
                rag_context=rag_context,
                age_cible=age,
                thematique=theme,
                style_texte=style
            )
            
            if not narration or len(narration) < 30:
                return {'success': False, 'error': 'Narration vide ou trop courte'}
            
            # SAUVEGARDER (thread-safe car PostgreSQL gère concurrence)
            pregen_id = add_pregeneration(
                oeuvre_id=oeuvre_id,
                age_cible=age,
                thematique=theme,
                style_texte=style,
                pregeneration_text=narration
            )
            
            if pregen_id:
                action = 'updated' if force_regenerate else 'generated'
                return {
                    'success': True,
                    'action': action,
                    'pregen_id': pregen_id
                }
            else:
                return {'success': False, 'error': 'Échec sauvegarde BDD'}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _check_existing(self, oeuvre_id: int, age: str, theme: str, style: str) -> bool:
        """Vérifie si une prégénération existe"""
        try:
            from rag.core.pregeneration_db import _connect_postgres
            conn = _connect_postgres()
            cur = conn.cursor()
            
            cur.execute("""
                SELECT 1 FROM pregenerations 
                WHERE oeuvre_id = %s AND age_cible = %s 
                AND thematique = %s AND style_texte = %s
            """, (oeuvre_id, age, theme, style))
            
            exists = cur.fetchone() is not None
            conn.close()
            return exists
            
        except Exception:
            return False


# Singleton
_ollama_pregen_instance = None

def get_ollama_pregeneration_system() -> OllamaPregenerationSystem:
    """Récupère l'instance unique du système"""
    global _ollama_pregen_instance
    if _ollama_pregen_instance is None:
        _ollama_pregen_instance = OllamaPregenerationSystem()
    return _ollama_pregen_instance
