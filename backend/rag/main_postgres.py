"""
API Flask pour Museum Voice Backend
Utilise PostgreSQL Docker
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
from pathlib import Path

# Import modules PostgreSQL (relatifs depuis rag/)
from .core.db_postgres import (
    init_postgres_db, get_artwork, get_all_artworks,
    search_artworks, add_artwork, add_artist, add_movement,
    get_artwork_sections, get_artwork_anecdotes,
    add_section, add_anecdote, add_chunk, get_artwork_chunks
)

from .core.pregeneration_db import (
    add_pregeneration, get_pregeneration,
    get_artwork_pregenerations, get_pregeneration_stats
)

# Import du processeur PDF
from .model_pdf_processor import ModelCompliantPDFProcessor

app = Flask(__name__)
CORS(app)  # Permettre requêtes depuis Next.js

# Initialiser PostgreSQL au démarrage
print("🔄 Initialisation PostgreSQL...")
try:
    init_postgres_db()
    print("✅ PostgreSQL prêt")
except Exception as e:
    print(f"⚠️ Erreur PostgreSQL: {e}")


# ===== HEALTHCHECK =====

@app.route('/health', methods=['GET'])
def health():
    """Healthcheck pour Docker"""
    return jsonify({
        'status': 'healthy',
        'service': 'museum-backend',
        'database': 'postgresql'
    })


@app.route('/api/debug/pregenerations/<int:oeuvre_id>', methods=['GET'])
def debug_pregenerations(oeuvre_id):
    """Debug: vérifier les prégénérations en BDD"""
    try:
        from .core.db_postgres import _connect_postgres
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT pregeneration_id, age_cible, thematique, style_texte, 
                   LENGTH(pregeneration_text) as longueur, 
                   LEFT(pregeneration_text, 200) as debut 
            FROM pregenerations 
            WHERE oeuvre_id = %s 
            ORDER BY pregeneration_id
        """, (oeuvre_id,))
        
        rows = cur.fetchall()
        
        pregenerations = []
        for row in rows:
            pregenerations.append({
                'pregeneration_id': row['pregeneration_id'],
                'age_cible': row['age_cible'],
                'thematique': row['thematique'],
                'style_texte': row['style_texte'],
                'longueur': row['longueur'],
                'debut': row['debut']
            })
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'oeuvre_id': oeuvre_id,
            'count': len(pregenerations),
            'pregenerations': pregenerations
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API OEUVRES =====

@app.route('/api/artworks', methods=['GET'])
def get_artworks_list():
    """Récupère toutes les œuvres"""
    try:
        artworks = get_all_artworks()
        return jsonify({
            'success': True,
            'count': len(artworks),
            'artworks': artworks
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/artworks/<int:artwork_id>', methods=['GET'])
def get_artwork_details(artwork_id):
    """Récupère détails d'une œuvre"""
    try:
        artwork = get_artwork(artwork_id)
        if not artwork:
            return jsonify({
                'success': False,
                'error': 'Œuvre non trouvée'
            }), 404
        
        # Ajouter sections et anecdotes
        sections = get_artwork_sections(artwork_id)
        anecdotes = get_artwork_anecdotes(artwork_id)
        
        return jsonify({
            'success': True,
            'artwork': artwork,
            'sections': sections,
            'anecdotes': anecdotes
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/artworks/search', methods=['GET'])
def search_artworks_api():
    """Recherche d'œuvres"""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({
            'success': False,
            'error': 'Paramètre de recherche manquant'
        }), 400
    
    try:
        results = search_artworks(query)
        return jsonify({
            'success': True,
            'query': query,
            'count': len(results),
            'results': results
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/artworks', methods=['POST'])
def create_artwork():
    """Crée une nouvelle œuvre"""
    try:
        data = request.get_json()
        
        # Validation
        if not data.get('title') or not data.get('artist'):
            return jsonify({
                'success': False,
                'error': 'Titre et artiste requis'
            }), 400
        
        # Créer œuvre
        oeuvre_id = add_artwork(
            title=data['title'],
            artist=data['artist'],
            description=data.get('description'),
            date_oeuvre=data.get('date_oeuvre'),
            materiaux_technique=data.get('materiaux_technique'),
            dimensions=data.get('dimensions'),
            image_link=data.get('image_link'),
            pdf_link=data.get('pdf_link'),
            room=data.get('room')
        )
        
        return jsonify({
            'success': True,
            'oeuvre_id': oeuvre_id
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API PREGENERATIONS =====

@app.route('/api/pregenerations/stats', methods=['GET'])
def pregenerations_stats():
    """Statistiques prégénérations"""
    try:
        stats = get_pregeneration_stats()
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/pregenerations/<int:oeuvre_id>', methods=['GET'])
def get_artwork_pregen(oeuvre_id):
    """Récupère prégénérations d'une œuvre"""
    try:
        pregenerations = get_artwork_pregenerations(oeuvre_id)
        return jsonify({
            'success': True,
            'oeuvre_id': oeuvre_id,
            'count': len(pregenerations),
            'pregenerations': pregenerations
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/pregenerations', methods=['POST'])
def create_pregeneration():
    """Crée une prégénération"""
    try:
        data = request.get_json()
        
        # Validation
        required = ['oeuvre_id', 'age_cible', 'thematique', 'style_texte', 'pregeneration_text']
        for field in required:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Champ requis: {field}'
                }), 400
        
        # Créer
        pregeneration_id = add_pregeneration(
            oeuvre_id=data['oeuvre_id'],
            age_cible=data['age_cible'],
            thematique=data['thematique'],
            style_texte=data['style_texte'],
            pregeneration_text=data['pregeneration_text'],
            voice_link=data.get('voice_link')
        )
        
        return jsonify({
            'success': True,
            'pregeneration_id': pregeneration_id
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API TRAITEMENT PDF =====

@app.route('/api/pdf/extract-metadata', methods=['POST'])
def extract_pdf_metadata():
    """
    Extrait les métadonnées d'un PDF (titre, artiste, description, etc.)
    SANS créer de chunks (traitement rapide 3-5 secondes)
    """
    print("🔍 DÉBUT extraction métadonnées PDF")
    try:
        # Vérifier le fichier
        if 'file' not in request.files:
            print("❌ Aucun fichier dans la requête")
            return jsonify({
                'success': False,
                'error': 'Aucun fichier fourni'
            }), 400
        
        file = request.files['file']
        print(f"📄 Fichier reçu: {file.filename}")
        
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            print(f"❌ Fichier non-PDF: {file.filename}")
            return jsonify({
                'success': False,
                'error': 'Fichier PDF requis'
            }), 400
        
        # Chemin du PDF (doit être dans /app/uploads/pdfs/)
        pdf_path = request.form.get('pdf_path')
        print(f"📂 Chemin PDF reçu: {pdf_path}")
        
        if not pdf_path:
            print("❌ Aucun chemin PDF fourni")
            return jsonify({
                'success': False,
                'error': 'Chemin PDF requis (pdf_path)'
            }), 400
        
        # Construire le chemin complet
        full_path = f"/app{pdf_path}"
        print(f"📂 Chemin complet: {full_path}")
        
        # Vérifier que le fichier existe
        if not os.path.exists(full_path):
            print(f"❌ Fichier non trouvé: {full_path}")
            return jsonify({
                'success': False,
                'error': f'Fichier non trouvé: {full_path}'
            }), 404
        
        print(f"✅ Fichier trouvé, début extraction...")
        
        # Extraire les métadonnées avec le processeur
        processor = ModelCompliantPDFProcessor()
        
        # Extraire le texte
        text = processor.extract_text_from_pdf(full_path)
        print(f"📖 Texte extrait: {len(text)} caractères")
        if not text:
            print("❌ Texte vide")
            return jsonify({
                'success': False,
                'error': 'Impossible d\'extraire le texte du PDF'
            }), 400
        
        # Extraire les champs
        metadata = {}
        for field in processor.patterns.keys():
            value = processor.extract_field(text, field)
            if value:
                metadata[field] = value
                print(f"  ✓ {field}: {value[:50]}...")
        
        print(f"✅ Métadonnées extraites: {len(metadata)} champs")
        
        # Extraire les anecdotes
        anecdotes = processor.extract_anecdotes(text)
        print(f"📝 Anecdotes: {len(anecdotes)}")
        
        # Retourner les métadonnées
        result = {
            'success': True,
            'metadata': {
                'title': metadata.get('titre', ''),
                'artist': metadata.get('artiste', ''),
                'lieu_naissance': metadata.get('lieu_naissance', ''),
                'date_oeuvre': metadata.get('date_oeuvre', ''),
                'materiaux': metadata.get('materiaux', ''),
                'mouvement': metadata.get('mouvement', ''),
                'provenance': metadata.get('provenance', ''),
                'contexte': metadata.get('contexte', ''),
                'description': metadata.get('description', ''),
                'analyse': metadata.get('analyse', ''),
                'iconographie': metadata.get('iconographie', ''),
                'reception': metadata.get('reception', ''),
                'parcours': metadata.get('parcours', ''),
                'anecdotes': anecdotes
            }
        }
        print(f"🎉 Retour: title='{result['metadata']['title']}', artist='{result['metadata']['artist']}'")
        return jsonify(result)
        
    except Exception as e:
        import traceback
        print(f"❌ Erreur extraction métadonnées: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/pdf/process-full', methods=['POST'])
def process_pdf_full():
    """
    Traitement complet d'un PDF : métadonnées + chunks + embeddings
    (Plus long : 30 sec - 2 min)
    À utiliser pour le traitement batch ou background
    """
    try:
        data = request.get_json()
        
        # Récupérer le chemin du PDF
        pdf_path = data.get('pdf_path')
        oeuvre_id = data.get('oeuvre_id')
        
        if not pdf_path:
            return jsonify({
                'success': False,
                'error': 'Chemin PDF requis (pdf_path)'
            }), 400
        
        # Construire le chemin complet
        full_path = f"/app{pdf_path}"
        
        # TODO: Implémenter le traitement complet
        # - Extraction métadonnées (déjà fait ci-dessus)
        # - Découpage en chunks
        # - Génération embeddings
        # - Stockage dans la base
        
        return jsonify({
            'success': True,
            'message': 'Traitement complet à implémenter (Phase 2)',
            'oeuvre_id': oeuvre_id
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API PRÉGÉNÉRATION AUTOMATIQUE =====

@app.route('/api/pregenerate-artwork/<int:oeuvre_id>', methods=['POST'])
def pregenerate_single_artwork(oeuvre_id):
    """Lance la prégénération COMPLÈTE avec Ollama pour une œuvre
    Flux: Chunks → Embeddings → FAISS → RAG → Ollama → 36 narrations uniques"""
    try:
        from .core.ollama_pregeneration_complete import get_ollama_pregeneration_system
        
        # Options
        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        skip_rag_setup = data.get('skip_rag_setup', False)
        
        # Lancer la prégénération COMPLÈTE
        system = get_ollama_pregeneration_system()
        result = system.pregenerate_artwork(
            oeuvre_id=oeuvre_id,
            force_regenerate=force_regenerate,
            skip_rag_setup=skip_rag_setup
        )
        
        if result.get('success'):
            stats = result.get('stats', {})
            return jsonify({
                'success': True,
                'oeuvre_id': oeuvre_id,
                'title': result.get('title'),
                'stats': stats,
                'duration': result.get('duration'),
                'message': f"{stats.get('generated', 0)} narrations générées avec Ollama"
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error')
            }), 500
        
    except Exception as e:
        import traceback
        print(f"❌ Erreur prégénération Ollama: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/pregenerate-all', methods=['POST'])
def pregenerate_all_artworks():
    """Lance la prégénération COMPLÈTE Ollama pour TOUTES les œuvres
    Flux complet RAG+FAISS+Ollama pour chaque œuvre"""
    try:
        from .core.ollama_pregeneration_complete import get_ollama_pregeneration_system
        
        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        
        system = get_ollama_pregeneration_system()
        result = system.pregenerate_all_artworks(force_regenerate=force_regenerate)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Prégénération globale terminée avec Ollama',
                'stats': result.get('stats'),
                'duration': result.get('duration')
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error')
            }), 500
        
    except Exception as e:
        import traceback
        print(f"❌ Erreur prégénération globale Ollama: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API RAG + EMBEDDINGS + FAISS =====

@app.route('/api/rag/embeddings/create/<int:oeuvre_id>', methods=['POST'])
def create_embeddings_api(oeuvre_id):
    """Crée les embeddings pour une œuvre"""
    try:
        from .core.rag_engine_postgres import get_rag_engine
        
        rag_engine = get_rag_engine()
        result = rag_engine.create_embeddings_for_artwork(oeuvre_id)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Erreur embeddings: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/rag/faiss/build/<int:oeuvre_id>', methods=['POST'])
def build_faiss_index_api(oeuvre_id):
    """Construit l'index FAISS pour une œuvre"""
    try:
        from .core.rag_engine_postgres import get_rag_engine
        
        rag_engine = get_rag_engine()
        result = rag_engine.build_faiss_index_for_artwork(oeuvre_id)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Erreur FAISS: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/rag/faiss/build-global', methods=['POST'])
def build_global_faiss_index_api():
    """Construit l'index FAISS global"""
    try:
        from .core.rag_engine_postgres import get_rag_engine
        
        rag_engine = get_rag_engine()
        result = rag_engine.build_global_index()
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/rag/search', methods=['POST'])
def rag_search_api():
    """Recherche sémantique dans les chunks"""
    try:
        data = request.get_json()
        query = data.get('query', '')
        oeuvre_id = data.get('oeuvre_id')
        top_k = data.get('top_k', 5)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Query manquante'
            }), 400
        
        from .core.rag_engine_postgres import get_rag_engine
        
        rag_engine = get_rag_engine()
        results = rag_engine.search_similar_chunks(
            query=query,
            oeuvre_id=oeuvre_id,
            top_k=top_k
        )
        
        return jsonify({
            'success': True,
            'query': query,
            'results': results
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API PRÉGÉNÉRATION AVEC LLM =====

@app.route('/api/llm/pregenerate-artwork/<int:oeuvre_id>', methods=['POST'])
def llm_pregenerate_artwork_api(oeuvre_id):
    """Génère les 36 narrations avec LLM pour une œuvre"""
    try:
        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        llm_provider = data.get('llm_provider', 'groq')  # ollama, groq, openai
        
        from .core.llm_pregeneration import get_pregeneration_system
        
        system = get_pregeneration_system(llm_provider=llm_provider)
        result = system.pregenerate_artwork(
            oeuvre_id=oeuvre_id,
            force_regenerate=force_regenerate
        )
        
        return jsonify({
            'success': True,
            'message': f"{result.get('generated', 0)} narrations générées avec {llm_provider.upper()}",
            **result
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Erreur prégénération LLM: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/llm/pregenerate-all', methods=['POST'])
def llm_pregenerate_all_api():
    """Génère les narrations LLM pour toutes les œuvres"""
    try:
        data = request.get_json() or {}
        force_regenerate = data.get('force_regenerate', False)
        llm_provider = data.get('llm_provider', 'groq')
        
        from .core.llm_pregeneration import get_pregeneration_system
        
        system = get_pregeneration_system(llm_provider=llm_provider)
        result = system.pregenerate_all_artworks(force_regenerate=force_regenerate)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API CHUNKS & EMBEDDINGS =====

@app.route('/api/chunks/create/<int:oeuvre_id>', methods=['POST'])
def create_chunks_for_artwork_api(oeuvre_id):
    """Crée les chunks pour une œuvre à partir de ses métadonnées"""
    try:
        from .traitement.chunk_creator_postgres import process_artwork_chunks
        
        result = process_artwork_chunks(oeuvre_id)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        import traceback
        print(f"❌ Erreur création chunks: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/chunks/<int:oeuvre_id>', methods=['GET'])
def get_artwork_chunks_api(oeuvre_id):
    """Récupère les chunks d'une œuvre"""
    try:
        chunks = get_artwork_chunks(oeuvre_id)
        
        return jsonify({
            'success': True,
            'oeuvre_id': oeuvre_id,
            'count': len(chunks),
            'chunks': chunks
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== API PARCOURS INTELLIGENT =====

@app.route('/api/parcours/generate', methods=['POST'])
def generate_intelligent_parcours():
    """
    Génère un parcours intelligent optimisé basé sur une durée cible
    
    Body JSON:
    {
        "age_cible": "adulte",
        "thematique": "technique_picturale",
        "style_texte": "analyse",
        "target_duration_minutes": 60,  # 15-180 par paliers de 15min
        "variation_seed": 1234  # Optionnel (pour reproductibilité)
    }
    
    Returns:
    {
        "success": true,
        "parcours": {
            "parcours_id": "parcours_1234",
            "profil": {...},
            "metadata": {
                "target_duration_minutes": 60,
                "artwork_count": 8,
                "total_distance_meters": 125.5,
                "total_duration_minutes": 58,
                "duration_breakdown": {
                    "walking_minutes": 10.5,
                    "narration_minutes": 38.2,
                    "observation_minutes": 12.0
                },
                "artworks_detail": [...]
            },
            "artworks": [...]
        }
    }
    """
    
    try:
        from .parcours.intelligent_path_generator import generer_parcours_intelligent
        
        data = request.get_json()
        
        # Paramètres obligatoires
        age_cible = data.get('age_cible')
        thematique = data.get('thematique')
        style_texte = data.get('style_texte')
        
        if not all([age_cible, thematique, style_texte]):
            return jsonify({
                'success': False,
                'error': 'Paramètres requis: age_cible, thematique, style_texte'
            }), 400
        
        # Paramètres optionnels
        target_duration = data.get('target_duration_minutes', 60)  # Défaut 1h
        variation_seed = data.get('variation_seed')
        
        # Générer le parcours
        parcours_json = generer_parcours_intelligent(
            age_cible=age_cible,
            thematique=thematique,
            style_texte=style_texte,
            target_duration_minutes=target_duration,
            variation_seed=variation_seed
        )
        
        return jsonify({
            'success': True,
            'parcours': parcours_json
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/parcours/preview', methods=['GET'])
def preview_parcours_options():
    """
    Affiche les options disponibles pour générer un parcours
    
    Returns:
    {
        "success": true,
        "options": {
            "age_cible": ["enfant", "ado", "adulte", "senior"],
            "thematique": ["technique_picturale", "biographie", "historique"],
            "style_texte": ["analyse", "decouverte", "anecdote"]
        },
        "stats": {
            "total_artworks_with_narrations": 5,
            "artworks_per_profile": {...}
        }
    }
    """
    
    try:
        from .core.db_postgres import _connect_postgres
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Compter les œuvres par profil
        cur.execute("""
            SELECT 
                age_cible,
                thematique,
                style_texte,
                COUNT(DISTINCT oeuvre_id) as count
            FROM pregenerations
            GROUP BY age_cible, thematique, style_texte
            ORDER BY age_cible, thematique, style_texte
        """)
        
        rows = cur.fetchall()
        
        stats_per_profile = {}
        for row in rows:
            key = f"{row['age_cible']}_{row['thematique']}_{row['style_texte']}"
            stats_per_profile[key] = row['count']
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'options': {
                'age_cible': ['enfant', 'ado', 'adulte', 'senior'],
                'thematique': ['technique_picturale', 'biographie', 'historique'],
                'style_texte': ['analyse', 'decouverte', 'anecdote']
            },
            'stats': {
                'artworks_per_profile': stats_per_profile,
                'total_profiles': len(stats_per_profile)
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== DÉMARRAGE =====

if __name__ == '__main__':
    print("🚀 Démarrage Museum Voice Backend")
    print("📍 Port: 5000")
    print("🗄️  Database: PostgreSQL")
    app.run(host='0.0.0.0', port=5000, debug=True)
