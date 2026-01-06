#!/usr/bin/env python3
"""
Création de chunks à partir des métadonnées PostgreSQL
Découpe le contenu en sections sémantiques pour RAG
"""

import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple

# Setup path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir.parent))
sys.path.insert(0, str(current_dir.parent / "core"))

from core.db_postgres import get_artwork, _connect_postgres


def create_chunks_for_artwork(oeuvre_id: int) -> List[Tuple[str, int]]:
    """
    Crée des chunks sémantiques OPTIMISÉS à partir des métadonnées de l'œuvre
    Structure les chunks pour meilleure pertinence RAG par thématique
    Retourne: List[(chunk_text, chunk_index)]
    """
    
    # Récupérer l'œuvre complète
    artwork = get_artwork(oeuvre_id)
    if not artwork:
        raise ValueError(f"Œuvre {oeuvre_id} non trouvée")
    
    chunks = []
    index = 0
    
    # CHUNK 0: MÉTADONNÉES ESSENTIELLES (toujours présent, prioritaire)
    metadata_chunk = f"""RÉFÉRENCE ŒUVRE
Titre : {artwork.get('title', 'Sans titre')}
Artiste : {artwork.get('artist', 'Artiste inconnu')}
Date : {artwork.get('date_oeuvre', 'Non renseignée')}
Technique : {artwork.get('materiaux_technique', 'Non renseignée')}"""
    
    if artwork.get('dimensions'):
        metadata_chunk += f"\nDimensions : {artwork['dimensions']}"
    
    chunks.append((metadata_chunk, index))
    index += 1
    
    # CHUNK 1: CONTEXTE HISTORIQUE & COMMANDE (thématique: historique)
    if artwork.get('contexte_commande') and len(artwork['contexte_commande']) > 80:
        context_chunk = f"""CONTEXTE HISTORIQUE ET COMMANDE
{artwork['contexte_commande'][:1200]}"""  # Limiter à 1200 chars max
        chunks.append((context_chunk, index))
        index += 1
    
    # CHUNK 2: DESCRIPTION & CONTEXTE ARTISTIQUE (thématique: biographie)
    if artwork.get('description') and len(artwork['description']) > 80:
        desc_chunk = f"""DESCRIPTION ET CONTEXTE ARTISTIQUE
{artwork['description'][:1200]}"""
        chunks.append((desc_chunk, index))
        index += 1
    
    # CHUNK 3: ANALYSE TECHNIQUE & MATÉRIELLE (thématique: technique_picturale)
    if artwork.get('analyse_materielle_technique') and len(artwork['analyse_materielle_technique']) > 80:
        technique_chunk = f"""ANALYSE TECHNIQUE ET MATÉRIELLE
Technique : {artwork.get('materiaux_technique', 'Non spécifiée')}

{artwork['analyse_materielle_technique'][:1200]}"""
        chunks.append((technique_chunk, index))
        index += 1
    
    # CHUNK 4: ICONOGRAPHIE & SYMBOLIQUE (utile pour toutes thématiques)
    if artwork.get('iconographie_symbolique') and len(artwork['iconographie_symbolique']) > 80:
        iconography_chunk = f"""ICONOGRAPHIE ET SYMBOLIQUE
{artwork['iconographie_symbolique'][:1200]}"""
        chunks.append((iconography_chunk, index))
        index += 1
    
    # CHUNK 5: RÉCEPTION & POSTÉRITÉ (thématique: historique)
    if artwork.get('reception_circulation_posterite') and len(artwork['reception_circulation_posterite']) > 80:
        reception_chunk = f"""RÉCEPTION CRITIQUE ET POSTÉRITÉ
{artwork['reception_circulation_posterite'][:1200]}"""
        chunks.append((reception_chunk, index))
        index += 1
    
    # CHUNK 6: CONSERVATION & PARCOURS (info générale)
    if artwork.get('parcours_conservation_doc') and len(artwork['parcours_conservation_doc']) > 80:
        conservation_chunk = f"""CONSERVATION ET DOCUMENTATION
{artwork['parcours_conservation_doc'][:1200]}"""
        chunks.append((conservation_chunk, index))
        index += 1
    
    # CHUNK 7: PROVENANCE (important pour contexte)
    if artwork.get('provenance') and len(artwork['provenance']) > 50:
        provenance_chunk = f"""PROVENANCE DE L'ŒUVRE
{artwork['provenance'][:800]}"""
        chunks.append((provenance_chunk, index))
        index += 1
    
    if not chunks or len(chunks) < 2:
        # Fallback: créer au minimum 2 chunks
        print(f"⚠️  Chunks minimal pour {oeuvre_id}")
        chunks = [
            (f"RÉFÉRENCE\nTitre : {artwork.get('title', 'Sans titre')}\nArtiste : {artwork.get('artist', 'Inconnu')}", 0),
            (f"CONTEXTE\nDate : {artwork.get('date_oeuvre', 'Inconnue')}", 1)
        ]
    
    print(f"✅ {len(chunks)} chunks créés pour l'œuvre {oeuvre_id} ({artwork.get('title', '')})")
    return chunks


def save_chunks_to_db(oeuvre_id: int, chunks: List[Tuple[str, int]]) -> int:
    """Sauvegarde les chunks dans PostgreSQL"""
    
    conn = _connect_postgres()
    cur = conn.cursor()
    
    try:
        # Supprimer les anciens chunks de cette œuvre
        cur.execute("DELETE FROM chunk WHERE oeuvre_id = %s", (oeuvre_id,))
        
        # Insérer les nouveaux chunks
        for chunk_text, chunk_index in chunks:
            cur.execute(
                "INSERT INTO chunk (chunk_text, chunk_index, oeuvre_id) VALUES (%s, %s, %s)",
                (chunk_text, chunk_index, oeuvre_id)
            )
        
        conn.commit()
        print(f"✅ {len(chunks)} chunks sauvegardés dans la BDD")
        return len(chunks)
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()


def process_artwork_chunks(oeuvre_id: int) -> Dict[str, Any]:
    """
    Traitement complet des chunks pour une œuvre :
    1. Créer les chunks à partir des métadonnées
    2. Sauvegarder en BDD
    3. Retourner les statistiques
    """
    
    try:
        # Créer les chunks
        chunks = create_chunks_for_artwork(oeuvre_id)
        
        if not chunks:
            return {
                'success': False,
                'error': 'Aucun chunk créé - métadonnées insuffisantes'
            }
        
        # Sauvegarder en BDD
        count = save_chunks_to_db(oeuvre_id, chunks)
        
        return {
            'success': True,
            'oeuvre_id': oeuvre_id,
            'chunks_created': count,
            'chunks': [{'text': text[:100] + '...', 'index': idx} for text, idx in chunks[:3]]  # Preview
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def main():
    """Test de création de chunks"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python chunk_creator_postgres.py <oeuvre_id>")
        sys.exit(1)
    
    oeuvre_id = int(sys.argv[1])
    result = process_artwork_chunks(oeuvre_id)
    
    if result['success']:
        print(f"\n🎉 Succès ! {result['chunks_created']} chunks créés")
    else:
        print(f"\n❌ Erreur : {result['error']}")


if __name__ == "__main__":
    main()
