#!/usr/bin/env python3
"""
MuseumVoice V3 - Script principal
Pipeline complet : PDF processing → RAG → Génération parcours
"""

import sys
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

# Import des modules V3
from config import MuseumVoiceConfig
from db import init_db, add_document
from doc_processing import process_pdf_file, extract_text_from_pdf, SummaryProcessor
from rag_engine import RAGEngine, quick_rag_setup
from parcours_engine import create_parcours


class MuseumVoiceV3:
    """Classe principale du système MuseumVoice V3"""
    
    def __init__(self, config=None):
        self.config = config or MuseumVoiceConfig()
        self.rag_engine = None
        self._setup()
    
    def _setup(self):
        """Initialisation du système"""
        print("🚀 Initialisation MuseumVoice V3...")
        
        # Créer les dossiers nécessaires
        self.config.PDF_DIR.mkdir(parents=True, exist_ok=True)
        self.config.INDEXES_DIR.mkdir(parents=True, exist_ok=True)
        self.config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self.config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        print("✅ Dossiers créés/vérifiés: 4")
        
        # Base de données
        init_db(str(self.config.DB_PATH))
        print(f"✅ Base de données: {self.config.DB_PATH}")
        print(f"📊 Status BDD: {'Existe' if self.config.DB_PATH.exists() else 'Créée'}")
        
        # RAG Engine
        self.rag_engine = RAGEngine(
            model_name=self.config.EMBEDDING_SETTINGS['model_name'],
            chunk_size=self.config.PDF_SETTINGS['chunk_size'],
            chunk_overlap=self.config.PDF_SETTINGS['chunk_overlap'],
            index_name="museumvoice_v3",
            db_path=str(self.config.DB_PATH)
        )
        print("✅ Moteur RAG initialisé")
    
    def process_pdf_directory(self, pdf_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
        """Traite tous les PDFs d'un dossier"""
        pdf_directory = pdf_dir or self.config.PDF_DIR
        
        if not pdf_directory.exists():
            print(f"❌ Dossier PDF non trouvé: {pdf_directory}")
            return []
        
        # Traiter les PDF et les fichiers texte
        pdf_files = list(pdf_directory.glob("*.pdf"))
        txt_files = list(pdf_directory.glob("*.txt"))
        all_files = pdf_files + txt_files
        
        if not all_files:
            print(f"ℹ️  Aucun fichier PDF ou TXT trouvé dans {pdf_directory}")
            return []
        
        print(f"📄 Traitement de {len(all_files)} fichiers ({len(pdf_files)} PDF, {len(txt_files)} TXT)...")
        processed_docs = []
        
        for file in all_files:
            try:
                print(f"   Traitement: {file.name}")
                start_time = time.time()
                
                # Traitement selon le type de fichier
                if file.suffix.lower() == '.pdf':
                    summary = process_pdf_file(str(file))
                elif file.suffix.lower() == '.txt':
                    # Traitement fichier texte
                    from doc_processing import SummaryProcessor
                    from db import add_document
                    
                    with open(file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    processor = SummaryProcessor()
                    summary = processor.process_document(content)
                    
                    # Sauvegarder en BDD
                    doc_id = add_document(
                        file_name=file.name,
                        file_path=str(file),
                        title=summary.title,
                        description=summary.summary,
                        word_count=int(summary.metadata.get('word_count', 0)),
                        artist=summary.artist
                    )
                    
                    # Les anecdotes sont maintenant intégrées directement dans les chunks
                else:
                    print(f"     ⚠️  Type de fichier non supporté: {file.suffix}")
                    continue
                
                # Récupérer l'ID du document créé
                from db import _connect
                conn = _connect(str(self.config.DB_PATH))
                cur = conn.cursor()
                cur.execute("SELECT oeuvre_id FROM Oeuvres WHERE file_name = ? ORDER BY created_at DESC LIMIT 1", (file.name,))
                row = cur.fetchone()
                doc_id = row[0] if row else None
                conn.close()
                
                # Créer les chunks automatiquement si document trouvé
                if doc_id and summary.summary:
                    # Vérifier si des chunks existent déjà pour ce document
                    conn = _connect(str(self.config.DB_PATH))
                    cur = conn.cursor()
                    cur.execute("SELECT COUNT(*) FROM Chunk WHERE oeuvre_id = ?", (doc_id,))
                    existing_chunks = cur.fetchone()[0]
                    conn.close()
                    
                    if existing_chunks == 0:
                        print(f"     Découpage en chunks (ID: {doc_id})...")
                        chunk_ids = self.rag_engine.split_document(doc_id, summary.summary)
                        print(f"     ✅ {len(chunk_ids)} chunks créés")
                    else:
                        print(f"     ✅ {existing_chunks} chunks déjà existants")
                        chunk_ids = []
                
                processing_time = int((time.time() - start_time) * 1000)
                
                processed_docs.append({
                    'file': file.name,
                    'title': summary.title,
                    'summary': summary.summary,

                    'word_count': int(summary.metadata.get('word_count', 0)),
                    'processing_time_ms': processing_time,
                    'chunks_created': len(chunk_ids) if 'chunk_ids' in locals() and chunk_ids else 0
                })
                
                print(f"   ✅ {file.name} ({processing_time}ms)")
                
            except Exception as e:
                print(f"   ❌ Erreur {file.name}: {e}")
                processed_docs.append({
                    'file': file.name,
                    'error': str(e)
                })
        
        return processed_docs
    
    def build_rag_index(self, oeuvre_ids: List[int] = None) -> bool:
        """Construit l'index RAG pour les œuvres"""
        try:
            print("🔍 Construction de l'index RAG...")
            start_time = time.time()
            
            if oeuvre_ids is None:
                # Récupérer toutes les œuvres
                from db import _connect
                conn = _connect(str(self.config.DB_PATH))
                cur = conn.cursor()
                cur.execute("SELECT oeuvre_id, title FROM Oeuvres")
                rows = cur.fetchall()
                oeuvre_ids = [row[0] for row in rows]
                conn.close()
                
                print(f"   Œuvres trouvées: {len(oeuvre_ids)}")
                for i, row in enumerate(rows[:3]):
                    print(f"     {i+1}. ID:{row[0]} - {row[1] or 'Sans titre'}")
                if len(rows) > 3:
                    print(f"     ... et {len(rows) - 3} autres")
            
            if not oeuvre_ids:
                print("❌ Aucune œuvre à indexer")
                return False
            
            print(f"   Indexation de {len(oeuvre_ids)} œuvres...")
            
            # Vérifier que les chunks existent pour ces œuvres
            from db import _connect, get_chunks_by_oeuvre
            conn = _connect(str(self.config.DB_PATH))
            
            # Compter les chunks existants
            total_chunks = 0
            for oeuvre_id in oeuvre_ids:
                chunks = get_chunks_by_oeuvre(oeuvre_id, str(self.config.DB_PATH))
                total_chunks += len(chunks)
            
            conn.close()
            
            if total_chunks == 0:
                print("❌ Aucun chunk trouvé pour ces œuvres")
                print("   Assurez-vous d'avoir d'abord exécuté l'étape de traitement des œuvres")
                return False
            
            print(f"   {total_chunks} chunks trouvés, construction de l'index...")
            
            # Construire index FAISS avec les chunks existants
            index_path = self.rag_engine.build_faiss_index(oeuvre_ids)
            build_time = int((time.time() - start_time) * 1000)
            print(f"✅ Index RAG construit ({build_time}ms): {index_path}")
            return True
                
        except Exception as e:
            print(f"❌ Erreur construction index RAG: {e}")
            return False
    
    def search_documents(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Recherche dans les documents avec RAG"""
        try:
            print(f"🔍 Recherche: '{query}'")
            start_time = time.time()
            
            results = self.rag_engine.search(query, top_k)
            search_time = int((time.time() - start_time) * 1000)
            
            print(f"✅ {len(results)} résultats trouvés ({search_time}ms)")
            
            for i, result in enumerate(results, 1):
                score = result.get('score', 0)
                title = result.get('title', 'Sans titre')
                content_preview = result.get('content', '')[:100]
                print(f"   {i}. {title} (score: {score:.3f})")
                print(f"      {content_preview}...")
            
            return results
            
        except Exception as e:
            print(f"❌ Erreur recherche: {e}")
            return []
    
    def generate_parcours(self, criteria: Dict[str, Any], 
                         max_duration: int = 90) -> Optional[int]:
        """Génère un parcours personnalisé"""
        try:
            print(f"🎯 Génération parcours: {criteria}")
            start_time = time.time()
            
            # Convertir critères en JSON
            import json
            criteria_json = json.dumps(criteria, ensure_ascii=False)
            
            # Mapping musée simple par défaut
            museum_mapping = {
                "rooms": [
                    {
                        "id": "salle1",
                        "name": "Salle principale",
                        "works": [],
                        "connections": ["salle2"],
                        "floor": 1
                    },
                    {
                        "id": "salle2", 
                        "name": "Salle secondaire",
                        "works": [],
                        "connections": ["salle1"],
                        "floor": 1
                    }
                ]
            }
            museum_mapping_json = json.dumps(museum_mapping, ensure_ascii=False)
            
            # Créer le parcours
            parcours_id = create_parcours(
                criteria_json=criteria_json,
                museum_mapping_json=museum_mapping_json,
                max_duration=max_duration,
                top_k=8,
                model="museumvoice_v3",
                db_path=str(self.config.DB_PATH)
            )
            
            generation_time = int((time.time() - start_time) * 1000)
            print(f"✅ Parcours généré (ID: {parcours_id}) en {generation_time}ms")
            
            return parcours_id
            
        except Exception as e:
            print(f"❌ Erreur génération parcours: {e}")
            return None
    
    def get_parcours_details(self, parcours_id: int) -> Optional[Dict[str, Any]]:
        """Récupère les détails d'un parcours"""
        try:
            from db import _connect
            conn = _connect(str(self.config.DB_PATH))
            cur = conn.cursor()
            cur.execute("SELECT * FROM parcours WHERE id = ?", (parcours_id,))
            row = cur.fetchone()
            conn.close()
            
            if row:
                return dict(row)
            return None
            
        except Exception as e:
            print(f"❌ Erreur récupération parcours: {e}")
            return None
    
    def show_database_status(self):
        """Affiche le statut de la base de données"""
        try:
            from db import _connect
            conn = _connect(str(self.config.DB_PATH))
            cur = conn.cursor()
            
            print(f"\n📊 STATUS BASE DE DONNÉES")
            print(f"Fichier: {self.config.DB_PATH}")
            print(f"Existe: {'✅' if self.config.DB_PATH.exists() else '❌'}")
            
            if self.config.DB_PATH.exists():
                # Œuvres
                cur.execute("SELECT COUNT(*) FROM Oeuvres")
                oeuvre_count = cur.fetchone()[0]
                print(f"Œuvres: {oeuvre_count}")
                
                if oeuvre_count > 0:
                    cur.execute("SELECT oeuvre_id, title, file_name FROM Oeuvres LIMIT 5")
                    oeuvres = cur.fetchall()
                    for oeuvre in oeuvres:
                        print(f"  - ID:{oeuvre[0]} {oeuvre[1] or oeuvre[2] or 'Sans titre'}")
                
                # Chunks
                cur.execute("SELECT COUNT(*) FROM Chunk")
                chunk_count = cur.fetchone()[0]
                print(f"Chunks: {chunk_count}")
                
                # Embeddings
                cur.execute("SELECT COUNT(*) FROM embeddings")
                embedding_count = cur.fetchone()[0]
                print(f"Embeddings: {embedding_count}")
                
                # Parcours
                cur.execute("SELECT COUNT(*) FROM parcours")
                parcours_count = cur.fetchone()[0]
                print(f"Parcours: {parcours_count}")
                
            conn.close()
            
        except Exception as e:
            print(f"❌ Erreur lecture BDD: {e}")
    
    def clear_database(self) -> bool:
        """Supprime et réinitialise complètement la base de données"""
        try:
            db_path = Path(self.config.DB_PATH)
            
            if db_path.exists():
                response = input("⚠️  ATTENTION: Supprimer TOUTES les données (documents, parcours, cache)? (y/n): ")
                if response.lower() not in ['y', 'yes', 'o', 'oui']:
                    print("Opération annulée")
                    return False
                
                print("🗑️  Suppression de la base de données...")
                
                # Supprimer fichier principal
                db_path.unlink()
                
                # Supprimer fichiers associés SQLite
                for suffix in ["-wal", "-shm", "-journal"]:
                    wal_file = Path(str(db_path) + suffix)
                    if wal_file.exists():
                        wal_file.unlink()
                        print(f"   Supprimé: {wal_file.name}")
                
                # Nettoyer dossiers cache et indexes
                for folder_name in ["indexes", "cache"]:
                    folder_path = self.config.BASE_DIR / folder_name
                    if folder_path.exists():
                        import shutil
                        shutil.rmtree(folder_path)
                        print(f"   Dossier supprimé: {folder_name}/")
                
                print("✅ Base de données et cache supprimés")
            
            # Réinitialiser complètement
            print("🔄 Réinitialisation du système...")
            self._setup()  # Re-setup complet
            
            print("✅ Système réinitialisé avec succès!")
            print("ℹ️  Vous pouvez maintenant traiter vos PDFs depuis le début")
            
            return True
            
        except Exception as e:
            print(f"❌ Erreur lors du nettoyage: {e}")
            return False
    
    def process_existing_documents(self):
        """Traite les documents existants qui n'ont pas encore de chunks"""
        try:
            print("🔄 Traitement des documents existants...")
            
            from db import _connect
            conn = _connect(str(self.config.DB_PATH))
            cur = conn.cursor()
            
            # Trouver œuvres sans chunks
            cur.execute("""
                SELECT o.oeuvre_id, o.title, o.description, o.file_name 
                FROM Oeuvres o 
                LEFT JOIN Chunk c ON o.oeuvre_id = c.oeuvre_id 
                WHERE c.oeuvre_id IS NULL AND o.description IS NOT NULL
            """)
            oeuvres_without_chunks = cur.fetchall()
            conn.close()
            
            if not oeuvres_without_chunks:
                print("   ✅ Toutes les œuvres ont déjà leurs chunks")
                return True
            
            print(f"   Traitement de {len(oeuvres_without_chunks)} œuvres...")
            
            total_chunks = 0
            for oeuvre in oeuvres_without_chunks:
                oeuvre_id, title, summary, file_name = oeuvre
                print(f"   Découpage: {title or file_name}")
                
                chunk_ids = self.rag_engine.split_document(oeuvre_id, summary)
                total_chunks += len(chunk_ids)
                print(f"     ✅ {len(chunk_ids)} chunks créés")
            
            print(f"✅ {total_chunks} chunks créés au total")
            return True
            
        except Exception as e:
            print(f"❌ Erreur traitement documents existants: {e}")
            return False
    
    def run_full_pipeline(self):
        """Exécute le pipeline complet : PDF → Chunks → Index"""
        try:
            print("🚀 PIPELINE COMPLET MUSEUMVOICE V3")
            print("=" * 50)
            
            # 1. Traitement PDF
            print("\n📄 ÉTAPE 1/5: Traitement des PDF")
            docs = self.process_pdf_directory()
            if not docs or all('error' in doc for doc in docs):
                print("❌ Aucun document traité avec succès")
                return False
            print(f"✅ {len([d for d in docs if 'error' not in d])} documents traités")
            
            # 2. Traitement documents existants sans chunks
            print("\n🔄 ÉTAPE 2/5: Vérification des chunks")
            self.process_existing_documents()
            
            # 3. Construction index RAG
            print("\n🔍 ÉTAPE 3/5: Construction de l'index RAG")
            success = self.build_rag_index()
            if not success:
                print("❌ Échec construction index RAG")
                return False
            
            # Résumé final
            print(f"\n🎉 PIPELINE TERMINÉ!")
            print("=" * 50)
            
            # Status final
            self.show_database_status()
            
            print(f"\n✅ Système prêt à l'utilisation!")
            print("   - Recherche dans les documents : Option 4")
            print("   - Génération de parcours : Option 5")
            
            return True
            
        except Exception as e:
            print(f"❌ Erreur pipeline complet: {e}")
            return False
    



def main():
    """Fonction principale"""
    print("🏛️  MUSEUMVOICE V3 - Système RAG pour Guides de Musée")
    print("=" * 60)
    
    # Initialiser le système
    museum_voice = MuseumVoiceV3()
    
    # Mode selon arguments
    if len(sys.argv) > 1:
        mode = sys.argv[1].lower()
        
        if mode == "pipeline":
            print("🚀 Mode pipeline complet")
            museum_voice.run_full_pipeline()
        
        elif mode == "process":
            print("📄 Mode traitement PDF")
            docs = museum_voice.process_pdf_directory()
            print(f"✅ {len(docs)} documents traités")
        
        elif mode == "index":
            print("🔍 Mode construction index")
            success = museum_voice.build_rag_index()
            print("✅ Index construit" if success else "❌ Échec construction index")
        
        elif mode == "search":
            query = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "art musée"
            print(f"🔍 Mode recherche: '{query}'")
            museum_voice.search_documents(query)
        
        elif mode == "parcours":
            print("🎯 Mode génération parcours")
            criteria = {"age": "15-18", "interests": ["art"], "duration": 60}
            parcours_id = museum_voice.generate_parcours(criteria)
            if parcours_id:
                print(f"✅ Parcours généré: ID {parcours_id}")
        
        elif mode == "pipeline" or mode == "full" or mode == "all":
            print("🚀 Mode pipeline complet")
            museum_voice.run_full_pipeline()
        
        elif mode == "clear" or mode == "clean" or mode == "reset":
            print("🗑️  Mode nettoyage base de données")
            museum_voice.clear_database()
        
        elif mode == "status" or mode == "info":
            print("📊 Mode status base de données")
            museum_voice.show_database_status()
        
        else:
            print(f"❌ Mode inconnu: {mode}")
            print("Modes disponibles: pipeline, process, index, search, parcours, status, clear")
    
    else:
        # Mode interactif par défaut
        print("\n🎮 MODE INTERACTIF")
        print("Commandes disponibles:")
        print("  0 - 🚀 Pipeline complet (recommandé)")
        print("  2 - Traitement PDF")
        print("  3 - Construction index RAG")
        print("  4 - Test recherche")
        print("  5 - Génération parcours")
        print("  6 - 🔄 Traiter documents existants")
        print("  8 - 📊 Status base de données")
        print("  9 - 🗑️  Nettoyer la base de données")
        print("  q - Quitter")
        
        while True:
            try:
                choice = input("\n> Votre choix: ").strip().lower()
                
                if choice == 'q':
                    break
                elif choice == '0':
                    museum_voice.run_full_pipeline()
                elif choice == '1':
                    print("Option supprimée")
                elif choice == '2':
                    docs = museum_voice.process_pdf_directory()
                    print(f"✅ {len(docs)} documents traités")
                elif choice == '3':
                    success = museum_voice.build_rag_index()
                    print("✅ Index construit" if success else "❌ Échec construction")
                elif choice == '4':
                    query = input("Recherche > ")
                    if query.strip():
                        museum_voice.search_documents(query.strip())
                elif choice == '5':
                    age = input("\u00c2ge (ex: 15-18) > ") or "15-18"
                    interests = input("Intérêts (ex: art,histoire) > ") or "art"
                    duration = int(input("Durée minutes (ex: 60) > ") or "60")
                    
                    criteria = {
                        "age": age,
                        "interests": interests.split(","),
                        "duration": duration
                    }
                    parcours_id = museum_voice.generate_parcours(criteria, duration)
                    if parcours_id:
                        print(f"✅ Parcours généré: ID {parcours_id}")
                elif choice == '6':
                    success = museum_voice.process_existing_documents()
                    if success:
                        print("✅ Documents traités, vous pouvez maintenant construire l'index !")
                elif choice == '8':
                    museum_voice.show_database_status()
                elif choice == '9':
                    success = museum_voice.clear_database()
                    if success:
                        print("🎯 Base de données nettoyée ! Vous pouvez maintenant retraiter vos PDFs.")
                else:
                    print("❌ Choix invalide")
            
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"❌ Erreur: {e}")
        
        print("\n👋 Au revoir!")


if __name__ == "__main__":
    main()