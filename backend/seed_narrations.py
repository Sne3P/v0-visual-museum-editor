#!/usr/bin/env python3
"""
Script de seed pour remplir les narrations prégénérées avec du Lorem Ipsum
Remplit toutes les combinaisons possibles pour chaque œuvre
"""

import psycopg2
import os

# Lorem Ipsum pour simuler les narrations
LOREM_IPSUM = """Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."""

# Paramètres de profil possibles
AGE_OPTIONS = ['enfant', 'ado', 'adulte', 'senior']
THEMATIQUE_OPTIONS = ['technique_picturale', 'biographie', 'historique']
STYLE_OPTIONS = ['analyse', 'decouverte', 'anecdote']

def connect_db():
    """Connexion à PostgreSQL"""
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', 5432),
        database=os.getenv('DB_NAME', 'museumvoice'),
        user=os.getenv('DB_USER', 'museum_admin'),
        password=os.getenv('DB_PASSWORD', 'Museum@2026!Secure')
    )

def create_pregeneration_table_if_not_exists(conn):
    """Crée la table pregenerations si elle n'existe pas"""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pregenerations (
                pregeneration_id SERIAL PRIMARY KEY,
                oeuvre_id INTEGER NOT NULL REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE,
                age_cible TEXT NOT NULL CHECK (age_cible IN ('enfant', 'ado', 'adulte', 'senior')),
                thematique TEXT NOT NULL CHECK (thematique IN ('technique_picturale', 'biographie', 'historique')),
                style_texte TEXT NOT NULL CHECK (style_texte IN ('analyse', 'decouverte', 'anecdote')),
                pregeneration_text TEXT NOT NULL,
                voice_link TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (oeuvre_id, age_cible, thematique, style_texte)
            );
            
            CREATE INDEX IF NOT EXISTS idx_pregeneration_profile 
            ON pregenerations(oeuvre_id, age_cible, thematique, style_texte);
        """)
        conn.commit()
        print("✅ Table pregenerations créée ou déjà existante")

def get_all_oeuvres(conn):
    """Récupère toutes les œuvres de la base"""
    with conn.cursor() as cur:
        cur.execute("SELECT oeuvre_id, title, artist FROM oeuvres ORDER BY oeuvre_id")
        return cur.fetchall()

def seed_pregenerations(conn, oeuvres):
    """Remplit les prégénérations pour toutes les œuvres"""
    total_combos = len(AGE_OPTIONS) * len(THEMATIQUE_OPTIONS) * len(STYLE_OPTIONS)
    total_inserts = len(oeuvres) * total_combos
    
    print(f"\n🌱 Début du seed...")
    print(f"   - {len(oeuvres)} œuvres trouvées")
    print(f"   - {total_combos} combinaisons de profil par œuvre")
    print(f"   - {total_inserts} narrations à insérer\n")
    
    inserted = 0
    updated = 0
    
    with conn.cursor() as cur:
        for oeuvre_id, title, artist in oeuvres:
            print(f"📝 Traitement: #{oeuvre_id} - {title} ({artist})")
            
            for age in AGE_OPTIONS:
                for theme in THEMATIQUE_OPTIONS:
                    for style in STYLE_OPTIONS:
                        # Variation du texte selon le profil
                        narration = f"{LOREM_IPSUM[:200]}... [Profil: {age}/{theme}/{style}]"
                        
                        cur.execute("""
                            INSERT INTO pregenerations 
                            (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (oeuvre_id, age_cible, thematique, style_texte)
                            DO UPDATE SET
                                pregeneration_text = EXCLUDED.pregeneration_text,
                                updated_at = CURRENT_TIMESTAMP
                            RETURNING (xmax = 0) AS inserted
                        """, (oeuvre_id, age, theme, style, narration))
                        
                        result = cur.fetchone()
                        if result and result[0]:
                            inserted += 1
                        else:
                            updated += 1
            
            conn.commit()
    
    print(f"\n✅ Seed terminé!")
    print(f"   - {inserted} nouvelles narrations insérées")
    print(f"   - {updated} narrations mises à jour")
    print(f"   - Total: {inserted + updated} narrations\n")

def main():
    """Point d'entrée principal"""
    print("=" * 60)
    print("🌱 SCRIPT DE SEED - NARRATIONS PRÉGÉNÉRÉES")
    print("=" * 60)
    
    try:
        # Connexion
        print("\n🔌 Connexion à la base de données...")
        conn = connect_db()
        print("✅ Connexion établie\n")
        
        # Création de la table si nécessaire
        create_pregeneration_table_if_not_exists(conn)
        
        # Récupération des œuvres
        oeuvres = get_all_oeuvres(conn)
        
        if not oeuvres:
            print("⚠️  Aucune œuvre trouvée dans la base!")
            print("   Veuillez d'abord insérer des œuvres dans la table 'oeuvres'")
            return
        
        # Seed des prégénérations
        seed_pregenerations(conn, oeuvres)
        
        # Fermeture
        conn.close()
        print("🎉 Seed complété avec succès!")
        
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
