#!/usr/bin/env python3
"""
Script de seed INTELLIGENT pour narrations prégénérées avec critères DYNAMIQUES
- Charge les critères depuis la DB (criteria_types + criterias)
- Génère toutes les combinaisons possibles
- Remplit SEULEMENT les narrations manquantes (pas de remplacement)
- Support du format JSONB pour criteria_combination
- Utilise Ollama pour générer de vraies narrations
"""

import psycopg2
import psycopg2.extras
import os
import json
import sys
from itertools import product
from pathlib import Path

# Ajouter le chemin du module backend pour importer rag
sys.path.insert(0, str(Path(__file__).parent))

from rag.core.ollama_generation import OllamaMediationSystem

def connect_db():
    """Connexion à PostgreSQL"""
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', 5432),
        database=os.getenv('DB_NAME', 'museumvoice'),
        user=os.getenv('DB_USER', 'museum_admin'),
        password=os.getenv('DB_PASSWORD', 'Museum@2026!Secure'),
        cursor_factory=psycopg2.extras.RealDictCursor
    )

def get_criteria_types_and_options(conn):
    """Récupère tous les types de critères et leurs options depuis la DB
    
    Returns:
        Dict[str, List[Dict]] - {"age": [{criteria_id: 1, name: "enfant", label: "Enfant", description: "...", ai_indication: "...", ...}], ...}
    """
    with conn.cursor() as cur:
        # 1. Charger les types de critères (ordre important)
        cur.execute("""
            SELECT type, label, ordre, is_required
            FROM criteria_types
            ORDER BY ordre
        """)
        types = cur.fetchall()
        
        if not types:
            print("⚠️  Aucun type de critère trouvé dans criteria_types!")
            return {}
        
        print(f"\n📋 {len(types)} types de critères trouvés:")
        for t in types:
            req_flag = "✅ REQUIS" if t['is_required'] else "⚪ Optionnel"
            print(f"   [{t['ordre']}] {t['type']} - {t['label']} ({req_flag})")
        
        # 2. Charger les options pour chaque type (AVEC tous les détails pour Ollama)
        criteria_map = {}
        for type_row in types:
            type_name = type_row['type']
            
            cur.execute("""
                SELECT criteria_id, type, name, label, description, ordre, ai_indication
                FROM criterias
                WHERE type = %s
                ORDER BY ordre
            """, (type_name,))
            
            options = cur.fetchall()
            criteria_map[type_name] = options
            
            print(f"      → {len(options)} options: {', '.join([opt['name'] for opt in options])}")
        
        return criteria_map

def generate_all_combinations(criteria_map):
    """Génère toutes les combinaisons possibles de critères
    
    Args:
        criteria_map: Dict[type_name, List[criteria_dict]]
    
    Returns:
        List[Dict[str, int]] - Liste de combinaisons JSONB
        Ex: [{"age": 1, "thematique": 4, "style_texte": 7}, ...]
    """
    if not criteria_map:
        return []
    
    # Extraire les listes d'options pour chaque type
    type_names = sorted(criteria_map.keys())  # Ordre alphabétique pour cohérence
    option_lists = [criteria_map[type_name] for type_name in type_names]
    
    # Générer le produit cartésien
    all_combinations = []
    for combo_tuple in product(*option_lists):
        # Créer un dict JSONB: {"age": 1, "thematique": 4, ...}
        combination = {}
        for i, option in enumerate(combo_tuple):
            type_name = type_names[i]
            combination[type_name] = option['criteria_id']
        
        all_combinations.append(combination)
    
    return all_combinations

def get_all_oeuvres(conn):
    """Récupère toutes les œuvres de la base"""
    with conn.cursor() as cur:
        cur.execute("SELECT oeuvre_id, title, artist FROM oeuvres ORDER BY oeuvre_id")
        return cur.fetchall()

def get_existing_pregenerations(conn, oeuvre_id):
    """Récupère les combinaisons déjà prégénérées pour une œuvre
    
    Returns:
        Set[str] - Set de JSON strings pour comparaison rapide
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT criteria_combination
            FROM pregenerations
            WHERE oeuvre_id = %s
        """, (oeuvre_id,))
        
        existing = set()
        for row in cur.fetchall():
            # Normaliser le JSON pour comparaison (clés triées)
            combo_dict = row['criteria_combination']
            combo_normalized = json.dumps(combo_dict, sort_keys=True)
            existing.add(combo_normalized)
        
        return existing

def seed_missing_narrations(conn, oeuvres, all_combinations, criteria_map):
    """Remplit SEULEMENT les narrations manquantes avec génération Ollama"""
    
    total_combos = len(all_combinations)
    total_possible = len(oeuvres) * total_combos
    
    print(f"\n🌱 Début du seed intelligent avec Ollama...")
    print(f"   - {len(oeuvres)} œuvres trouvées")
    print(f"   - {total_combos} combinaisons de critères possibles")
    print(f"   - {total_possible} narrations maximales\n")
    
    # Initialiser le système Ollama
    print("🤖 Initialisation du générateur Ollama...")
    ollama_system = OllamaMediationSystem()
    
    inserted = 0
    skipped = 0
    errors = 0
    
    with conn.cursor() as cur:
        for oeuvre in oeuvres:
            oeuvre_id = oeuvre['oeuvre_id']
            title = oeuvre['title']
            artist = oeuvre['artist']
            
            # Charger les métadonnées complètes de l'œuvre
            cur.execute("""
                SELECT oeuvre_id, title, artist, description, date_oeuvre,
                       materiaux_technique, provenance, contexte_commande,
                       analyse_materielle_technique, iconographie_symbolique,
                       anecdotes, reception_circulation_posterite,
                       parcours_conservation_doc, room
                FROM oeuvres WHERE oeuvre_id = %s
            """, (oeuvre_id,))
            artwork_full = cur.fetchone()
            
            if not artwork_full:
                print(f"⚠️  Œuvre {oeuvre_id} non trouvée en détail, skip")
                continue
            
            # Récupérer les combinaisons existantes
            existing = get_existing_pregenerations(conn, oeuvre_id)
            
            print(f"\n📝 Œuvre #{oeuvre_id}: {title} ({artist})")
            print(f"   Déjà prégénéré: {len(existing)}/{total_combos}")
            
            new_in_this_oeuvre = 0
            
            # Insérer seulement les combinaisons manquantes
            for combination in all_combinations:
                combo_normalized = json.dumps(combination, sort_keys=True)
                
                if combo_normalized in existing:
                    skipped += 1
                    continue
                
                # Construire la combinaison enrichie pour Ollama
                # combination = {"age": 1, "thematique": 4, ...}
                combinaison_enrichie = {}
                for crit_type, crit_id in combination.items():
                    # Trouver les détails du critère
                    criteres_type = criteria_map.get(crit_type, [])
                    critere_detail = next((c for c in criteres_type if c['criteria_id'] == crit_id), None)
                    if critere_detail:
                        combinaison_enrichie[crit_type] = {
                            'criteria_id': critere_detail['criteria_id'],
                            'name': critere_detail['name'],
                            'label': critere_detail['label'],
                            'description': critere_detail.get('description'),
                            'ai_indication': critere_detail.get('ai_indication')
                        }
                
                if len(combinaison_enrichie) != len(combination):
                    print(f"   ⚠️  Combinaison invalide, skip: {combination}")
                    errors += 1
                    continue
                
                # Générer la narration avec Ollama
                try:
                    result = ollama_system.generate_mediation_for_one_work(
                        artwork=dict(artwork_full),
                        combinaison=combinaison_enrichie,
                        duree_minutes=3
                    )
                    
                    if not result['success']:
                        print(f"   ❌ Erreur génération: {result.get('error')}")
                        errors += 1
                        continue
                    
                    narration = result['text']
                    
                except Exception as e:
                    print(f"   ❌ Exception génération: {e}")
                    errors += 1
                    continue
                
                # Insérer avec JSONB
                try:
                    cur.execute("""
                        INSERT INTO pregenerations 
                        (oeuvre_id, criteria_combination, pregeneration_text)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (oeuvre_id, criteria_combination) DO NOTHING
                    """, (oeuvre_id, json.dumps(combination), narration))
                    
                    inserted += 1
                    new_in_this_oeuvre += 1
                    
                    # Commit après chaque insertion pour éviter de perdre tout en cas d'erreur
                    conn.commit()
                    
                    # Afficher progression
                    criteria_labels = ", ".join([f"{k}={combinaison_enrichie[k]['name']}" for k in sorted(combinaison_enrichie.keys())])
                    print(f"   ✅ [{new_in_this_oeuvre}] Généré: {criteria_labels}")
                    
                except Exception as e:
                    print(f"   ❌ Erreur DB insert: {e}")
                    errors += 1
                    conn.rollback()
                    continue
            
            print(f"   📊 Bilan œuvre: {new_in_this_oeuvre} nouvelles narrations")
    
    print(f"\n✅ Seed terminé!")
    print(f"   - {inserted} nouvelles narrations insérées")
    print(f"   - {skipped} combinaisons déjà existantes (non modifiées)")
    print(f"   - {errors} erreurs de génération")
    print(f"   - Total dans la base: {inserted + skipped} narrations\n")

def insert_pregeneration_criterias(conn):
    """Remplit la table de liaison pregeneration_criterias depuis criteria_combination JSONB
    
    Cette table permet des JOIN rapides sur criteria_id
    """
    print("\n🔗 Remplissage de la table de liaison pregeneration_criterias...")
    
    with conn.cursor() as cur:
        # Vider la table de liaison
        cur.execute("DELETE FROM pregeneration_criterias")
        
        # Récupérer toutes les prégénérations
        cur.execute("""
            SELECT pregeneration_id, criteria_combination
            FROM pregenerations
        """)
        pregenerations = cur.fetchall()
        
        # Pour chaque prégénération, extraire les criteria_id du JSONB
        total_links = 0
        for pregen in pregenerations:
            pregen_id = pregen['pregeneration_id']
            combination = pregen['criteria_combination']  # Dict {"age": 1, "thematique": 4, ...}
            
            # Insérer un lien pour chaque criteria_id
            for criteria_id in combination.values():
                cur.execute("""
                    INSERT INTO pregeneration_criterias (pregeneration_id, criteria_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                """, (pregen_id, criteria_id))
                total_links += 1
        
        conn.commit()
        print(f"   ✅ {total_links} liens criteria_id créés pour {len(pregenerations)} prégénérations")

def show_statistics(conn):
    """Affiche des statistiques sur les prégénérations"""
    print("\n📊 Statistiques de la base:")
    
    with conn.cursor() as cur:
        # Total narrations
        cur.execute("SELECT COUNT(*) as total FROM pregenerations")
        total = cur.fetchone()['total']
        
        # Par œuvre
        cur.execute("""
            SELECT o.title, o.artist, COUNT(p.pregeneration_id) as nb_narrations
            FROM oeuvres o
            LEFT JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
            GROUP BY o.oeuvre_id, o.title, o.artist
            ORDER BY nb_narrations DESC
            LIMIT 5
        """)
        top_oeuvres = cur.fetchall()
        
        print(f"\n   Total narrations: {total}")
        print(f"\n   Top 5 œuvres avec le plus de narrations:")
        for oeuvre in top_oeuvres:
            print(f"      - {oeuvre['title']} ({oeuvre['artist']}): {oeuvre['nb_narrations']} narrations")

def main():
    """Point d'entrée principal"""
    print("=" * 70)
    print("🌱 SCRIPT DE SEED INTELLIGENT - NARRATIONS DYNAMIQUES AVEC OLLAMA")
    print("=" * 70)
    
    try:
        # Connexion
        print("\n🔌 Connexion à la base de données...")
        conn = connect_db()
        print("✅ Connexion établie")
        
        # 1. Charger les critères depuis la DB
        criteria_map = get_criteria_types_and_options(conn)
        
        if not criteria_map:
            print("\n❌ Aucun critère trouvé! Veuillez d'abord seed la table criterias.")
            return
        
        # 2. Générer toutes les combinaisons
        all_combinations = generate_all_combinations(criteria_map)
        print(f"\n🔢 {len(all_combinations)} combinaisons totales générées")
        
        # 3. Récupérer les œuvres
        oeuvres = get_all_oeuvres(conn)
        
        if not oeuvres:
            print("\n⚠️  Aucune œuvre trouvée dans la base!")
            print("   Veuillez d'abord insérer des œuvres dans la table 'oeuvres'")
            return
        
        # 4. Seed intelligent avec Ollama (seulement les manquantes)
        seed_missing_narrations(conn, oeuvres, all_combinations, criteria_map)
        
        # 5. Remplir la table de liaison
        insert_pregeneration_criterias(conn)
        
        # 6. Statistiques
        show_statistics(conn)
        
        # Fermeture
        conn.close()
        print("\n🎉 Seed complété avec succès!")
        
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
