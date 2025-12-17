"""
Script pour peupler la table parcours avec différents profils
"""

from parcours_database import generer_et_sauvegarder_parcours, lister_tous_les_parcours
import time


def peupler_table_parcours():
    """Génère et sauvegarde plusieurs parcours pour différents profils"""
    
    print("🎯 PEUPLEMENT DE LA TABLE PARCOURS")
    print("=" * 50)
    
    # Différents profils de parcours à générer
    profils_parcours = [
        # Profils enfants
        {"age": "enfant", "theme": "technique_picturale", "style": "decouverte", "nb": 2, "desc": "Enfant - Techniques"},
        {"age": "enfant", "theme": "biographie", "style": "anecdote", "nb": 3, "desc": "Enfant - Vies d'artistes"},
        {"age": "enfant", "theme": "historique", "style": "decouverte", "nb": 2, "desc": "Enfant - Histoire"},
        
        # Profils adolescents  
        {"age": "ado", "theme": "technique_picturale", "style": "analyse", "nb": 4, "desc": "Ado - Techniques avancées"},
        {"age": "ado", "theme": "historique", "style": "anecdote", "nb": 3, "desc": "Ado - Histoire & anecdotes"},
        {"age": "ado", "theme": "biographie", "style": "decouverte", "nb": 5, "desc": "Ado - Parcours biographique"},
        
        # Profils adultes
        {"age": "adulte", "theme": "technique_picturale", "style": "analyse", "nb": 4, "desc": "Adulte - Analyse technique"},
        {"age": "adulte", "theme": "biographie", "style": "analyse", "nb": 3, "desc": "Adulte - Biographies approfondies"},
        {"age": "adulte", "theme": "historique", "style": "analyse", "nb": 5, "desc": "Adulte - Contexte historique"},
        
        # Profils seniors
        {"age": "senior", "theme": "biographie", "style": "analyse", "nb": 3, "desc": "Senior - Maîtres & biographies"},
        {"age": "senior", "theme": "historique", "style": "analyse", "nb": 4, "desc": "Senior - Histoire de l'art"},
        {"age": "senior", "theme": "technique_picturale", "style": "decouverte", "nb": 2, "desc": "Senior - Techniques découverte"}
    ]
    
    results = []
    
    for i, profil in enumerate(profils_parcours, 1):
        print(f"\n📝 {i:2d}/12 - {profil['desc']}")
        print("-" * 30)
        
        start_time = time.time()
        
        try:
            result = generer_et_sauvegarder_parcours(
                age_cible=profil['age'],
                thematique=profil['theme'],
                style_texte=profil['style'],
                nombre_oeuvres=profil['nb']
            )
            
            generation_time = time.time() - start_time
            
            if 'parcours_id' in result and result['sauvegarde']:
                stats = result['stats']
                print(f"✅ ID: {result['parcours_id']} | {generation_time:.3f}s | {stats['duree_estimee']}min | {stats['longueur_totale']} chars")
                
                results.append({
                    'profil': profil,
                    'id': result['parcours_id'],
                    'stats': stats,
                    'time': generation_time,
                    'success': True
                })
            else:
                print(f"❌ Échec: {result}")
                results.append({
                    'profil': profil,
                    'error': result,
                    'success': False
                })
                
        except Exception as e:
            print(f"❌ Exception: {e}")
            results.append({
                'profil': profil,
                'error': str(e),
                'success': False
            })
    
    # Statistiques finales
    print(f"\n" + "=" * 50)
    print("📊 RÉSULTATS DU PEUPLEMENT")
    print("=" * 50)
    
    successes = [r for r in results if r['success']]
    failures = [r for r in results if not r['success']]
    
    print(f"✅ Parcours créés: {len(successes)}/{len(results)} ({len(successes)/len(results)*100:.1f}%)")
    
    if successes:
        total_time = sum(r['time'] for r in successes)
        avg_length = sum(r['stats']['longueur_totale'] for r in successes) / len(successes)
        avg_duration = sum(r['stats']['duree_estimee'] for r in successes) / len(successes)
        
        print(f"⚡ Temps total: {total_time:.2f}s")
        print(f"📏 Longueur moyenne: {avg_length:.0f} caractères")
        print(f"⏱️  Durée moyenne: {avg_duration:.1f} minutes")
        
        # Répartition par âge
        by_age = {}
        for r in successes:
            age = r['profil']['age']
            by_age[age] = by_age.get(age, 0) + 1
        
        print(f"👥 Répartition: {dict(by_age)}")
    
    if failures:
        print(f"❌ Échecs: {failures}")
    
    return results


def afficher_table_parcours():
    """Affiche le contenu de la table parcours"""
    print(f"\n📋 CONTENU DE LA TABLE PARCOURS")
    print("=" * 60)
    
    parcours_list = lister_tous_les_parcours(20)
    
    if not parcours_list:
        print("🔍 Aucun parcours trouvé")
        return
    
    print(f"📊 {len(parcours_list)} parcours sauvegardés:\n")
    
    # Regrouper par âge
    by_age = {}
    for parcours in parcours_list:
        age = parcours['criteria']['age_cible']
        if age not in by_age:
            by_age[age] = []
        by_age[age].append(parcours)
    
    for age, parcours_age in by_age.items():
        print(f"👥 {age.upper()} ({len(parcours_age)} parcours):")
        for parcours in parcours_age:
            criteria = parcours['criteria']
            print(f"  • ID {parcours['id']:2d} | {criteria['thematique']:15s} | {criteria['style_texte']:10s} | {parcours['duree_minutes']:2d}min")
        print()


if __name__ == "__main__":
    # Peupler la table
    results = peupler_table_parcours()
    
    # Afficher le résultat
    afficher_table_parcours()
    
    print("🎯 Peuplement terminé!")