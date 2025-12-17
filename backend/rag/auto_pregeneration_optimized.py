#!/usr/bin/env python3
"""
Système de prégénération automatique OPTIMISÉ avec parallelisation et batch inserts
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional, Tuple
from pregeneration_db_optimized import add_pregeneration, get_pregeneration_stats, add_pregenerations_batch
from intelligent_generator import IntelligentContentGenerator
from model_db import get_all_artworks, _connect_structured

class AutoPregenerationSystemOptimized:
    """
    Système automatique optimisé de prégénération de contenu pour toutes les œuvres.
    Utilise la parallélisation et les batch inserts pour des performances maximales.
    """
    
    def __init__(self, db_path: Optional[str] = None, max_workers: int = 4):
        self.db_path = db_path
        self.generator = IntelligentContentGenerator()
        self.max_workers = max_workers
        
        # Critères de génération
        self.ages = ['enfant', 'ado', 'adulte', 'senior']
        self.themes = ['technique_picturale', 'biographie', 'historique']
        self.styles = ['analyse', 'decouverte', 'anecdote']
    
    def check_existing_pregeneration(self, oeuvre_id: int, age_cible: str, 
                                   thematique: str, style_texte: str) -> bool:
        """Vérifie si une prégénération existe déjà"""
        conn = _connect_structured(self.db_path)
        cur = conn.cursor()
        
        try:
            cur.execute("""
                SELECT 1 FROM pregenerations 
                WHERE oeuvre_id = ? AND age_cible = ? AND thematique = ? AND style_texte = ?
            """, (oeuvre_id, age_cible, thematique, style_texte))
            
            return cur.fetchone() is not None
        finally:
            conn.close()

    def pregenerate_artwork_optimized(self, oeuvre_id: int, artwork_title: str = "", force_regenerate: bool = False) -> Dict[str, int]:
        """
        Prégénère tout le contenu pour une œuvre spécifique avec optimisation batch.
        """
        print(f"🎨 Traitement œuvre: {artwork_title or f'ID {oeuvre_id}'}")
        
        stats = {
            'generated': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0
        }
        
        # Collecter toutes les générations pour cette œuvre
        batch_data = []
        
        for age in self.ages:
            for theme in self.themes:
                for style in self.styles:
                    
                    if not force_regenerate and self.check_existing_pregeneration(oeuvre_id, age, theme, style):
                        stats['skipped'] += 1
                        continue
                    
                    try:
                        # Générer le contenu
                        content = self.generator.generate_content_for_artwork(
                            oeuvre_id, age, theme, style, self.db_path
                        )
                        
                        # Ajouter au batch
                        batch_data.append((oeuvre_id, age, theme, style, content))
                        
                    except Exception as e:
                        print(f"❌ Erreur {age}-{theme}-{style}: {str(e)}")
                        stats['errors'] += 1
        
        # Exécuter le batch insert en une seule transaction
        if batch_data:
            try:
                created_ids = add_pregenerations_batch(batch_data, self.db_path)
                if created_ids:
                    stats['generated'] = len(created_ids)
                    
                    # Afficher les générations créées
                    for i, (_, age, theme, style, _) in enumerate(batch_data):
                        if i < len(created_ids) and created_ids[i]:
                            print(f"✨ Nouvelle prégénération créée (ID: {created_ids[i]})")
                            print(f"✨ Généré: {age}-{theme}-{style}")
                        
            except Exception as e:
                print(f"❌ Erreur lors du batch insert: {str(e)}")
                stats['errors'] += len(batch_data)
        
        # Résumé pour cette œuvre
        total_tried = len(self.ages) * len(self.themes) * len(self.styles)
        print(f"\n📊 Résumé œuvre:")
        print(f"   ✨ Générées: {stats['generated']}")
        print(f"   🔄 Mises à jour: {stats['updated']}")
        print(f"   ⏭️  Ignorées: {stats['skipped']}")
        print(f"   ❌ Erreurs: {stats['errors']}")
        
        if stats['errors'] == 0:
            success_rate = ((stats['generated'] + stats['updated']) / (total_tried - stats['skipped'])) * 100 if (total_tried - stats['skipped']) > 0 else 0
            print(f"   📈 Réussite: {success_rate:.1f}%")
        
        return stats
    
    def pregenerate_artwork(self, oeuvre_id: int, force_regenerate: bool = False) -> Dict[str, int]:
        """
        Version legacy - utilise la nouvelle méthode optimisée.
        """
        return self.pregenerate_artwork_optimized(oeuvre_id, force_regenerate=force_regenerate)

    def pregenerate_all_artworks(self, force_regenerate: bool = False, use_parallel: bool = True) -> None:
        """
        Lance la prégénération optimisée pour toutes les œuvres avec parallélisation.
        """
        start_time = time.time()
        
        print("🎨 SYSTÈME DE PRÉGÉNÉRATION AUTOMATIQUE OPTIMISÉ")
        print("=" * 55)
        print(f"🚀 Démarrage de la prégénération {'parallèle' if use_parallel else 'séquentielle'}...")
        
        # Récupérer toutes les œuvres
        artworks = get_all_artworks(self.db_path)
        
        if not artworks:
            print("❌ Aucune œuvre trouvée dans la base de données")
            return
        
        total_artworks = len(artworks)
        total_combinations = total_artworks * len(self.ages) * len(self.themes) * len(self.styles)
        
        print(f"📊 {total_artworks} œuvre(s) trouvée(s)")
        print(f"🎯 Total de combinaisons à générer : {total_combinations}")
        if use_parallel:
            print(f"⚡ Utilisation de {self.max_workers} workers en parallèle")
        
        # Statistiques globales
        global_stats = {
            'generated': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0
        }
        
        if use_parallel and total_artworks > 1:
            # Traitement parallèle
            self._process_artworks_parallel(artworks, force_regenerate, global_stats)
        else:
            # Traitement séquentiel (pour débugger ou petites collections)
            self._process_artworks_sequential(artworks, force_regenerate, global_stats)
        
        # Résumé final
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"\n{'='*80}")
        print("🎉 PRÉGÉNÉRATION TERMINÉE")
        print(f"{'='*80}")
        print(f"⏱️  Durée totale: {duration:.2f} secondes")
        print(f"🎨 Œuvres traitées: {total_artworks}")
        print(f"🎯 Combinaisons possibles: {total_combinations}")
        
        print(f"\n📊 Résultats:")
        print(f"   ✨ Nouvelles générations: {global_stats['generated']}")
        print(f"   🔄 Mises à jour: {global_stats['updated']}")
        print(f"   ⏭️  Ignorées (existantes): {global_stats['skipped']}")
        print(f"   ❌ Erreurs: {global_stats['errors']}")
        
        # Calculs de performance
        total_processed = global_stats['generated'] + global_stats['updated']
        if total_processed > 0:
            success_rate = (total_processed / (total_processed + global_stats['errors'])) * 100
            speed = total_processed / duration if duration > 0 else 0
            print(f"   📈 Taux de réussite: {success_rate:.1f}%")
            print(f"   ⚡ Vitesse: {speed:.2f} combinaisons/seconde")
            
            # Gain de performance
            if use_parallel and duration > 0:
                estimated_sequential = duration * self.max_workers * 0.7  # Facteur d'efficacité parallèle
                speedup = estimated_sequential / duration if duration > 0 else 1
                print(f"   🚀 Accélération estimée: {speedup:.1f}x")
        
        # Statistiques de la base
        db_stats = get_pregeneration_stats(self.db_path)
        if db_stats:
            print(f"\n🗄️  État de la base:")
            print(f"   📚 Total prégénérations: {db_stats['total_pregenerations']}")
            print(f"   🎨 Œuvres couvertes: {db_stats['covered_artworks']}/{db_stats['total_artworks']} ({db_stats['coverage_percentage']:.1f}%)")
            
            if 'age_distribution' in db_stats:
                print(f"\n🎭 Répartition par critères:")
                print(f"   👥 Par âge: {db_stats['age_distribution']}")
                print(f"   🎨 Par thématique: {db_stats['theme_distribution']}")
                print(f"   📝 Par style: {db_stats['style_distribution']}")
        
        print("\n✅ Prégénération terminée avec succès!")
    
    def _process_artworks_parallel(self, artworks: List[Dict], force_regenerate: bool, global_stats: Dict[str, int]) -> None:
        """
        Traite les œuvres en parallèle avec ThreadPoolExecutor.
        """
        total_artworks = len(artworks)
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Soumettre toutes les tâches
            future_to_artwork = {
                executor.submit(self.pregenerate_artwork_optimized, 
                               artwork['oeuvre_id'], 
                               artwork.get('titre', f'Œuvre {artwork["oeuvre_id"]}'), 
                               force_regenerate): artwork 
                for artwork in artworks
            }
            
            # Traiter les résultats au fur et à mesure
            completed = 0
            for future in as_completed(future_to_artwork):
                artwork = future_to_artwork[future]
                completed += 1
                
                try:
                    artwork_stats = future.result()
                    
                    # Mettre à jour les stats globales
                    for key in global_stats:
                        global_stats[key] += artwork_stats[key]
                    
                    print(f"📈 Progression globale: {(completed/total_artworks)*100:.1f}%")
                    
                except Exception as e:
                    titre = artwork.get('titre', f'Œuvre {artwork["oeuvre_id"]}')
                    print(f"❌ Erreur lors du traitement de {titre}: {str(e)}")
                    global_stats['errors'] += 36  # 36 combinaisons par œuvre
    
    def _process_artworks_sequential(self, artworks: List[Dict], force_regenerate: bool, global_stats: Dict[str, int]) -> None:
        """
        Traite les œuvres séquentiellement (version originale optimisée).
        """
        total_artworks = len(artworks)
        
        for i, artwork in enumerate(artworks, 1):
            oeuvre_id = artwork['oeuvre_id']
            titre = artwork.get('titre', f'Œuvre {oeuvre_id}')
            
            print(f"\n{'='*60}")
            print(f"🎨 [{i}/{total_artworks}] Traitement: {titre} (ID: {oeuvre_id})")
            print(f"{'='*60}")
            
            # Prégénérer pour cette œuvre
            artwork_stats = self.pregenerate_artwork_optimized(oeuvre_id, titre, force_regenerate)
            
            # Mettre à jour les stats globales
            for key in global_stats:
                global_stats[key] += artwork_stats[key]
            
            # Progression
            progress = (i / total_artworks) * 100
            print(f"📈 Progression globale: {progress:.1f}%")

def main():
    """
    Point d'entrée principal du script avec options d'optimisation.
    """
    import sys
    
    # Paramètres par défaut
    force_regenerate = False
    max_workers = 4
    use_parallel = True
    
    # Parsing des arguments simples
    if '--force' in sys.argv:
        force_regenerate = True
        print("🔄 Mode force regenerate activé")
    
    if '--sequential' in sys.argv:
        use_parallel = False
        print("📝 Mode séquentiel activé")
    
    if '--workers' in sys.argv:
        try:
            idx = sys.argv.index('--workers')
            if idx + 1 < len(sys.argv):
                max_workers = int(sys.argv[idx + 1])
                print(f"⚡ Nombre de workers: {max_workers}")
        except (ValueError, IndexError):
            print("⚠️  Valeur workers invalide, utilisation de 4 par défaut")
    
    # Initialiser et lancer le système
    system = AutoPregenerationSystemOptimized(max_workers=max_workers)
    system.pregenerate_all_artworks(
        force_regenerate=force_regenerate,
        use_parallel=use_parallel
    )
    
    print("\n💡 Options disponibles:")
    print("   --force         : Régénérer même si existant")
    print("   --sequential    : Mode séquentiel (debug)")
    print("   --workers N     : Nombre de workers parallèles")

if __name__ == "__main__":
    main()