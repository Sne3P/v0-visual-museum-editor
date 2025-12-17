#!/usr/bin/env python3
"""Script pour vérifier le contenu stocké en base"""

import sqlite3
from pathlib import Path

def check_database_content():
    """Vérifie le contenu complet stocké en base"""
    
    # Connexion à la base
    db_path = Path('../../database/museum_v1.db')
    if not db_path.exists():
        print("❌ Base de données non trouvée")
        return
        
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    print("=== VÉRIFICATION CONTENU COMPLET EN BASE ===\n")

    # Récupérer toutes les œuvres
    cur.execute("SELECT * FROM oeuvres")
    artworks = cur.fetchall()

    for artwork in artworks:
        print(f"🎨 ŒUVRE: {artwork['titre']}")
        print(f"👨‍🎨 Artiste: {artwork['artiste_nom'] or 'N/A'}")
        
        # Vérification des champs longs
        if artwork['description']:
            desc_len = len(artwork['description'])
            print(f"📝 Description ({desc_len} caractères):")
            print(f"   {artwork['description']}")
        
        if artwork['contexte_commande']:
            ctx_len = len(artwork['contexte_commande'])
            print(f"📋 Contexte ({ctx_len} caractères):")
            print(f"   {artwork['contexte_commande']}")
            
        if artwork['analyse_materielle_technique']:
            ana_len = len(artwork['analyse_materielle_technique'])
            print(f"🔬 Analyse ({ana_len} caractères):")
            print(f"   {artwork['analyse_materielle_technique']}")
        
        if artwork['iconographie_symbolique']:
            ico_len = len(artwork['iconographie_symbolique'])
            print(f"🎭 Iconographie ({ico_len} caractères):")
            print(f"   {artwork['iconographie_symbolique']}")
            
        print(f"🏛️ Mouvement: {artwork['periode_mouvement'] or 'N/A'}")
        print(f"📅 Date: {artwork['date_oeuvre'] or 'N/A'}")
        print(f"🎨 Matériaux: {artwork['materiaux_technique'] or 'N/A'}")
        
        print("-" * 60)
    
    # Vérifier les anecdotes
    cur.execute("SELECT COUNT(*) as count FROM anecdotes")
    anecdote_count = cur.fetchone()['count']
    print(f"💭 Total anecdotes stockées: {anecdote_count}")
    
    if anecdote_count > 0:
        cur.execute("SELECT * FROM anecdotes LIMIT 2")
        anecdotes = cur.fetchall()
        for anecdote in anecdotes:
            print(f"   Anecdote {anecdote['numero']}: {anecdote['contenu'][:100]}...")

    conn.close()
    
    print("\n✅ Vérification terminée")

if __name__ == "__main__":
    check_database_content()