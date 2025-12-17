"""
Script de test pour le générateur de parcours personnalisés
Teste différents profils et configurations
"""

from parcours_generator import generer_parcours_rapide
import time


def test_parcours_profiles():
    """Teste différents profils de parcours"""
    
    print("🎯 TEST DU GÉNÉRATEUR DE PARCOURS PERSONNALISÉS")
    print("="*60)
    
    # Configuration des tests
    test_configs = [
        {
            'name': 'Enfant - Découverte technique',
            'age': 'enfant',
            'thematique': 'technique_picturale', 
            'style': 'decouverte',
            'nb_oeuvres': 3
        },
        {
            'name': 'Adolescent - Histoire & Anecdotes',
            'age': 'ado',  # Utiliser 'ado' au lieu de 'adolescent' 
            'thematique': 'historique',  # Utiliser 'historique' au lieu de 'contexte_historique'
            'style': 'anecdote', 
            'nb_oeuvres': 4
        },
        {
            'name': 'Senior - Biographie & Analyse',
            'age': 'senior',
            'thematique': 'biographie',
            'style': 'analyse',  # Utiliser 'analyse' au lieu de 'contemplation'
            'nb_oeuvres': 2
        }
    ]
    
    results = []
    
    for config in test_configs:
        print(f"\n🎭 {config['name']}")
        print("-" * 40)
        
        start_time = time.time()
        
        try:
            result = generer_parcours_rapide(
                age_cible=config['age'],
                thematique=config['thematique'], 
                style_texte=config['style'],
                nombre_oeuvres=config['nb_oeuvres']
            )
            
            generation_time = time.time() - start_time
            
            if 'parcours_complet' in result:
                stats = result['stats']
                print(f"✅ Généré en {generation_time:.2f}s")
                print(f"📏 {stats['longueur_totale']} caractères")
                print(f"⏱️  {stats['duree_estimee']} minutes estimées")
                print(f"🎨 {stats['nombre_oeuvres']} œuvres")
                
                # Extrait court du parcours
                parcours = result['parcours_complet']
                intro_lines = parcours.split('\n')[:8]  # Première partie
                print(f"\n📖 Aperçu:")
                print('\n'.join(intro_lines) + '\n...\n')
                
                results.append({
                    'config': config,
                    'stats': stats,
                    'time': generation_time,
                    'success': True
                })
            else:
                print(f"❌ Erreur: {result}")
                results.append({
                    'config': config,
                    'error': result,
                    'success': False
                })
                
        except Exception as e:
            print(f"❌ Exception: {e}")
            results.append({
                'config': config,
                'error': str(e),
                'success': False
            })
    
    # Résumé des tests
    print("\n" + "="*60)
    print("📊 RÉSUMÉ DES TESTS")
    print("="*60)
    
    successes = [r for r in results if r['success']]
    failures = [r for r in results if not r['success']]
    
    print(f"✅ Succès: {len(successes)}/{len(results)} ({len(successes)/len(results)*100:.1f}%)")
    
    if successes:
        avg_time = sum(r['time'] for r in successes) / len(successes)
        avg_length = sum(r['stats']['longueur_totale'] for r in successes) / len(successes)
        avg_duration = sum(r['stats']['duree_estimee'] for r in successes) / len(successes)
        
        print(f"⚡ Temps moyen: {avg_time:.2f}s")
        print(f"📏 Longueur moyenne: {avg_length:.0f} caractères")  
        print(f"⏱️  Durée moyenne: {avg_duration:.1f} minutes")
    
    if failures:
        print(f"\n❌ Échecs: {len(failures)}")
        for failure in failures:
            print(f"   - {failure['config']['name']}: {failure['error']}")
    
    return results


def test_parcours_specifique():
    """Test d'un parcours spécifique pour enfant"""
    print("\n🧒 TEST PARCOURS ENFANT DÉTAILLÉ")
    print("="*50)
    
    result = generer_parcours_rapide(
        age_cible="enfant",
        thematique="biographie",  # Utiliser une thématique disponible
        style_texte="decouverte",  # Utiliser un style disponible
        nombre_oeuvres=2
    )
    
    if 'parcours_complet' in result:
        print(result['parcours_complet'])
        print(f"\n📊 Analyse du contenu:")
        
        parcours = result['parcours_complet']
        
        # Analyse du vocabulaire adapté aux enfants
        mots_enfants = ['découvrir', 'aventure', 'incroyable', 'magnifique', 'bravo']
        vocabulaire_enfant = sum(1 for mot in mots_enfants if mot.lower() in parcours.lower())
        
        print(f"   👶 Vocabulaire adapté: {vocabulaire_enfant} mots enfants détectés")
        print(f"   📏 Phrases courtes: {'Oui' if parcours.count('.') > parcours.count(',') else 'Non'}")
        print(f"   🎨 Émojis utilisés: {'Oui' if any(c in parcours for c in '🎨🎭👨‍🎨') else 'Non'}")


if __name__ == "__main__":
    # Tests complets
    test_results = test_parcours_profiles()
    
    # Test spécifique enfant  
    test_parcours_specifique()
    
    print(f"\n🎯 Tests terminés!")