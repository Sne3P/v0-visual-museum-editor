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
    add_section, add_anecdote, add_chunk, get_artwork_chunks,
    _connect_postgres
)

from .core.pregeneration_db import (
    add_pregeneration, get_pregeneration,
    get_artwork_pregenerations, get_pregeneration_stats
)

# Import du processeur PDF
from .model_pdf_processor import ModelCompliantPDFProcessor

# Import des routes TTS
from .tts.routes import tts_bp

app = Flask(__name__)
CORS(app)  # Permettre requêtes depuis Next.js

# Enregistrer les blueprints
app.register_blueprint(tts_bp)

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


# ===== API CRITÈRES DYNAMIQUES =====

@app.route('/api/criteria-types', methods=['GET'])
def get_criteria_types_legacy():
    """
    Compat client React: retourne les types de critères
    Format attendu: { success: true, types: [{ type_name, label, ordre, is_required }] }
    """
    try:
        from .core.criteria_service import criteria_service

        types = criteria_service.get_criteria_types()

        # Adapter le format pour le frontend client (type_name au lieu de type)
        adapted = [
            {
                'type_name': t['type'],
                'label': t['label'],
                'ordre': t['ordre'],
                'is_required': t['is_required']
            }
            for t in types
        ]

        return jsonify({
            'success': True,
            'types': adapted
        })
    except Exception as e:
        return jsonify({ 'success': False, 'error': str(e) }), 500


@app.route('/api/criterias', methods=['GET'])
def get_criterias_query():
    """
    Compat client React: GET /api/criterias?type=age
    Retourne la liste des paramètres pour un type donné
    """
    try:
        type_name = request.args.get('type')
        if not type_name:
            return jsonify({ 'success': False, 'error': 'type query param requis' }), 400

        from .core.criteria_service import criteria_service
        criterias = criteria_service.get_criteria_by_type(type_name)

        return jsonify({
            'success': True,
            'criterias': criterias
        })
    except Exception as e:
        return jsonify({ 'success': False, 'error': str(e) }), 500

@app.route('/api/criterias/types', methods=['GET'])
def get_criteria_types():
    """
    Récupère tous les types de critères disponibles
    SYSTÈME DYNAMIQUE
    """
    try:
        from .core.criteria_service import criteria_service
        
        criteria_types = criteria_service.get_criteria_types()
        
        return jsonify({
            'success': True,
            'criteria_types': criteria_types
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/criterias/by-type/<string:type_name>', methods=['GET'])
def get_criterias_by_type(type_name):
    """
    Récupère tous les critères d'un type spécifique
    SYSTÈME DYNAMIQUE
    
    Args:
        type_name: Type de critère (age, thematique, accessibilite, etc.)
    """
    try:
        from .core.criteria_service import criteria_service
        
        criterias = criteria_service.get_criteria_by_type(type_name)
        
        return jsonify({
            'success': True,
            'type': type_name,
            'criterias': criterias,
            'count': len(criterias)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/criterias/all', methods=['GET'])
def get_all_criterias():
    """
    Récupère tous les critères groupés par type
    SYSTÈME DYNAMIQUE - Parfait pour alimenter un formulaire de sélection
    """
    try:
        from .core.criteria_service import criteria_service
        
        # Récupérer tous les types
        criteria_types = criteria_service.get_criteria_types()
        
        # Pour chaque type, récupérer ses critères
        result = []
        for ctype in criteria_types:
            criterias = criteria_service.get_criteria_by_type(ctype['type'])
            result.append({
                'type': ctype['type'],
                'label': ctype['label'],
                'ordre': ctype['ordre'],
                'is_required': ctype['is_required'],
                'options': criterias
            })
        
        return jsonify({
            'success': True,
            'criteria_groups': result,
            'total_types': len(result),
            'total_criterias': sum(len(g['options']) for g in result)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/debug/pregenerations/<int:oeuvre_id>', methods=['GET'])
def debug_pregenerations(oeuvre_id):
    """Debug: vérifier les prégénérations en BDD avec N critères DYNAMIQUES"""
    try:
        from .core.db_postgres import _connect_postgres
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Requête avec criterias en JSONB
        cur.execute("""
            SELECT 
                p.pregeneration_id,
                p.criteria_combination,
                LENGTH(p.pregeneration_text) as longueur, 
                LEFT(p.pregeneration_text, 200) as debut,
                ARRAY_AGG(
                    JSON_BUILD_OBJECT(
                        'type', c.type_name,
                        'name', c.name,
                        'label', c.label
                    )
                ) as criterias_detail
            FROM pregenerations p
            LEFT JOIN pregeneration_criterias pc ON p.pregeneration_id = pc.pregeneration_id
            LEFT JOIN criterias c ON pc.criteria_id = c.criteria_id
            WHERE p.oeuvre_id = %s 
            GROUP BY p.pregeneration_id
            ORDER BY p.pregeneration_id
        """, (oeuvre_id,))
        
        rows = cur.fetchall()
        
        pregenerations = []
        for row in rows:
            pregenerations.append({
                'pregeneration_id': row['pregeneration_id'],
                'criteria_combination': row['criteria_combination'],
                'criterias_detail': row['criterias_detail'],
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
    """Crée une prégénération avec N critères DYNAMIQUES"""
    try:
        from .core.criteria_service import criteria_service
        
        data = request.get_json()
        
        # Validation des champs requis - FORMAT DYNAMIQUE avec dict
        required = ['oeuvre_id', 'criteria', 'pregeneration_text']
        for field in required:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Champ requis: {field}'
                }), 400
        
        # criteria doit être un dict, ex: {"age": 1, "thematique": 4, "style_texte": 7}
        criteria_dict = data['criteria']
        
        if not isinstance(criteria_dict, dict):
            return jsonify({
                'success': False,
                'error': 'Le champ "criteria" doit être un objet JSON {type: id}'
            }), 400
        
        # Valider que tous les critères obligatoires sont présents
        is_valid, missing = criteria_service.validate_required_criteria(criteria_dict)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': f'Critères obligatoires manquants: {", ".join(missing)}'
            }), 400
        
        # Valider que les critères existent et sont actifs
        if not criteria_service.validate_criteria_combination(criteria_dict):
            return jsonify({
                'success': False,
                'error': 'Combinaison de critères invalide ou critères inactifs'
            }), 400
        
        # Créer
        pregeneration_id = add_pregeneration(
            oeuvre_id=data['oeuvre_id'],
            criteria_dict=criteria_dict,
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
    AVEC génération automatique des fichiers audio TTS
    SYSTÈME VRAIMENT DYNAMIQUE - Accepte N critères variables
    
    Body JSON:
    {
        "criteria": {               # Dict flexible de N critères
            "age": "adulte",        # Noms des critères (seront résolus vers IDs)
            "thematique": "technique_picturale",
            "style_texte": "analyse"
            // Peut avoir 2, 5, ou N critères !
        },
        "target_duration_minutes": 60,
        "variation_seed": 1234,
        "generate_audio": true
    }
    
    Returns: { success, parcours {...}, audio {...} }
    """
    
    try:
        # UTILISER V3
        from .parcours.intelligent_parcours_v3 import generate_parcours_v3
        from .core.criteria_service import criteria_service
        from .tts import get_piper_service
        import time
        
        print("🔵 [PARCOURS] Utilisation de generate_parcours_v3 (V3)")
        
        data = request.get_json()
        
        # Paramètres obligatoires - FORMAT DYNAMIQUE
        criteria_names = data.get('criteria')  # Dict {type: name}
        
        if not criteria_names or not isinstance(criteria_names, dict):
            return jsonify({
                'success': False,
                'error': 'Paramètre requis: "criteria" (objet {type: name})'
            }), 400
        
        # Résoudre les noms vers IDs via criteria_service
        criteria_dict = {}  # {type: id}
        for type_name, criteria_name in criteria_names.items():
            criteria = criteria_service.get_criteria_by_name(type_name, criteria_name)
            if not criteria:
                return jsonify({
                    'success': False,
                    'error': f'Critère invalide: {type_name}={criteria_name}'
                }), 400
            criteria_dict[type_name] = criteria['criteria_id']
        
        # Valider que tous les critères obligatoires sont présents
        is_valid, missing = criteria_service.validate_required_criteria(criteria_dict)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': f'Critères obligatoires manquants: {", ".join(missing)}'
            }), 400
        
        # Paramètres optionnels
        target_duration = data.get('target_duration_minutes', 60)
        variation_seed = data.get('variation_seed')
        generate_audio = data.get('generate_audio', True)
        
        # Générer le parcours avec V3
        print(f"   📐 Génération parcours V3: profile={criteria_dict}, duration={target_duration}min, seed={variation_seed}")
        parcours_json = generate_parcours_v3(
            profile=criteria_dict,
            target_duration_min=target_duration,
            seed=variation_seed
        )
        print(f"   ✅ Parcours V3 généré: {len(parcours_json.get('artworks', []))} œuvres")
        
        audio_result = {
            'generated': False,
            'count': 0,
            'paths': {}
        }
        
        # Générer les audios si demandé
        if generate_audio:
            try:
                # Extraire le parcours_id (format: "parcours_1234")
                parcours_id_str = parcours_json.get('parcours_id', '')
                parcours_id = int(parcours_id_str.split('_')[-1]) if '_' in parcours_id_str else int(time.time())
                
                # Préparer les narrations pour TTS
                narrations = []
                for artwork in parcours_json.get('artworks', []):
                    narrations.append({
                        'oeuvre_id': artwork['oeuvre_id'],
                        'narration_text': artwork['narration']
                    })
                
                # Générer les audios
                piper = get_piper_service('fr_FR')
                audio_paths = piper.generate_parcours_audio(
                    parcours_id=parcours_id,
                    narrations=narrations,
                    language='fr_FR'
                )
                
                # Intégrer les chemins audio dans les artworks
                for artwork in parcours_json.get('artworks', []):
                    oeuvre_id = artwork['oeuvre_id']
                    if oeuvre_id in audio_paths:
                        artwork['audio_path'] = audio_paths[oeuvre_id]
                
                audio_result = {
                    'generated': True,
                    'count': len(audio_paths),
                    'paths': audio_paths
                }
                
            except Exception as audio_error:
                # Si erreur audio, on continue quand même avec le parcours
                print(f"⚠️ Erreur génération audio: {audio_error}")
                audio_result['error'] = str(audio_error)
        
        return jsonify({
            'success': True,
            'parcours': parcours_json,
            'audio': audio_result
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


@app.route('/api/parcours/map', methods=['POST'])
def get_parcours_map():
    """
    Récupère les données du plan pour visualiser un parcours
    
    Body JSON:
    {
        "artworks": [{oeuvre_id, order}, ...]
    }
    
    Returns:
    {
        "success": true,
        "map_data": {
            "rooms": [{room_id, name, polygon_points: [{x, y}]}],
            "artworks": [{oeuvre_id, title, x, y, room, order}]
        }
    }
    """
    
    try:
        from .core.db_postgres import _connect_postgres
        
        data = request.get_json()
        artworks_input = data.get('artworks', [])
        
        if not artworks_input:
            return jsonify({
                'success': False,
                'error': 'No artworks provided'
            }), 400
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Récupérer les IDs des œuvres
        oeuvre_ids = [a['oeuvre_id'] for a in artworks_input]
        order_map = {a['oeuvre_id']: a['order'] for a in artworks_input}
        
        # Récupérer les positions des œuvres (centre calculé)
        # Les ARTWORK ont 4 points (rectangle), on calcule le centre
        cur.execute("""
            SELECT 
                o.oeuvre_id,
                o.title,
                o.artist,
                o.room,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y,
                COUNT(p.point_id) as point_count
            FROM oeuvres o
            LEFT JOIN entities e ON e.oeuvre_id = o.oeuvre_id AND e.entity_type = 'ARTWORK'
            LEFT JOIN points p ON p.entity_id = e.entity_id
            WHERE o.oeuvre_id = ANY(%s)
            GROUP BY o.oeuvre_id, o.title, o.artist, o.room
        """, (oeuvre_ids,))
        
        artworks_data = []
        artworks_without_position = []
        
        for row in cur.fetchall():
            if row['center_x'] is not None and row['center_y'] is not None:
                artworks_data.append({
                    'oeuvre_id': row['oeuvre_id'],
                    'title': row['title'],
                    'artist': row['artist'],
                    'room': row['room'],
                    'x': float(row['center_x']),
                    'y': float(row['center_y']),
                    'order': order_map.get(row['oeuvre_id'], 0)
                })
            else:
                artworks_without_position.append(row)
        
        # Si des œuvres n'ont pas de position, les placer au centre de leur salle (entity ROOM)
        if artworks_without_position:
            for artwork in artworks_without_position:
                # Trouver la salle ROOM entity qui correspond
                cur.execute("""
                    SELECT AVG(p.x) as center_x, AVG(p.y) as center_y
                    FROM entities e
                    JOIN points p ON p.entity_id = e.entity_id
                    WHERE e.entity_type = 'ROOM'
                    LIMIT 1
                """)
                
                center = cur.fetchone()
                if center and center['center_x']:
                    artworks_data.append({
                        'oeuvre_id': artwork['oeuvre_id'],
                        'title': artwork['title'],
                        'artist': artwork['artist'],
                        'room': artwork['room'],
                        'x': float(center['center_x']),
                        'y': float(center['center_y']),
                        'order': order_map.get(artwork['oeuvre_id'], 0)
                    })
                else:
                    # Fallback: position arbitraire
                    artworks_data.append({
                        'oeuvre_id': artwork['oeuvre_id'],
                        'title': artwork['title'],
                        'artist': artwork['artist'],
                        'room': artwork['room'],
                        'x': 100.0 + (artwork['oeuvre_id'] * 50),
                        'y': 100.0,
                        'order': order_map.get(artwork['oeuvre_id'], 0)
                    })
        
        # Récupérer TOUTES les salles du plan (pour avoir le contexte complet)
        cur.execute("""
            SELECT DISTINCT
                e.entity_id as room_id,
                e.name as room_name,
                p.x,
                p.y,
                p.ordre
            FROM entities e
            JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            ORDER BY e.entity_id, p.ordre
        """)
        
        rooms_dict = {}
        for row in cur.fetchall():
            room_id = row['room_id']
            if room_id not in rooms_dict:
                rooms_dict[room_id] = {
                    'room_id': room_id,
                    'name': row['room_name'] or f"Salle {room_id}",
                    'polygon_points': []
                }
            rooms_dict[room_id]['polygon_points'].append({
                'x': float(row['x']),
                'y': float(row['y'])
            })
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'map_data': {
                'rooms': list(rooms_dict.values()),
                'artworks': sorted(artworks_data, key=lambda a: a['order'])
            }
        })
        
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


@app.route('/api/parcours', methods=['GET'])
def list_parcours():
    """
    Liste tous les parcours générés
    
    Returns:
    [
        {
            "group_id": "uuid",
            "segment_count": 5,
            "criteria": {"age": "Adulte", "thematique": "Technique picturale"},
            "created_at": "2024-01-15T10:30:00"
        },
        ...
    ]
    """
    try:
        from .core.db_postgres import _connect_postgres
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Récupérer la liste des parcours avec leurs infos
        cur.execute("""
            SELECT 
                group_id,
                COUNT(*) as segment_count,
                criteria_combination,
                MIN(created_at) as created_at
            FROM parcours_segments
            WHERE group_id IS NOT NULL
            GROUP BY group_id, criteria_combination
            ORDER BY created_at DESC
        """)
        
        rows = cur.fetchall()
        parcours_list = []
        
        for row in rows:
            criteria_dict = row[2] if row[2] else {}
            parcours_list.append({
                'group_id': row[0],
                'segment_count': row[1],
                'criteria': criteria_dict,
                'created_at': row[3].isoformat() if row[3] else None
            })
        
        cur.close()
        conn.close()
        
        return jsonify(parcours_list), 200
        
    except Exception as e:
        print(f"❌ Erreur liste parcours: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/parcours/<group_id>', methods=['GET'])
def get_parcours_details(group_id):
    """
    Récupère les détails d'un parcours spécifique
    
    Returns:
    {
        "group_id": "uuid",
        "segments": [
            {
                "id": 1,
                "segment_order": 1,
                "segment_type": "artwork",
                "guide_text": "...",
                "duration_minutes": 5,
                "oeuvre_info": {...}
            },
            ...
        ],
        "criteria": {"age": "Adulte", "thematique": "Technique picturale"}
    }
    """
    try:
        from .core.db_postgres import _connect_postgres
        
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Récupérer tous les segments du parcours
        cur.execute("""
            SELECT 
                id, segment_order, segment_type, guide_text,
                total_duration_minutes, oeuvre_info, criteria_combination
            FROM parcours_segments
            WHERE group_id = %s
            ORDER BY segment_order
        """, (group_id,))
        
        rows = cur.fetchall()
        
        if not rows:
            cur.close()
            conn.close()
            return jsonify({'error': 'Parcours not found'}), 404
        
        segments = []
        criteria = rows[0][6] if rows[0][6] else {}
        
        for row in rows:
            segments.append({
                'id': row[0],
                'segment_order': row[1],
                'segment_type': row[2],
                'guide_text': row[3],
                'duration_minutes': row[4] or 5,
                'oeuvre_info': row[5] or {}
            })
        
        cur.close()
        conn.close()
        
        return jsonify({
            'group_id': group_id,
            'segments': segments,
            'criteria': criteria
        }), 200
        
    except Exception as e:
        print(f"❌ Erreur détails parcours: {e}")
        return jsonify({'error': str(e)}), 500


# ===== ADMIN ROUTES =====

@app.route('/api/admin/seed-narrations', methods=['POST'])
@app.route('/api/admin/seed-narrations/<int:oeuvre_id>', methods=['POST'])
def admin_seed_narrations(oeuvre_id=None):
    """
    Seed narrations avec script Python intelligent
    
    POST /api/admin/seed-narrations - Seed toutes les œuvres
    POST /api/admin/seed-narrations/<oeuvre_id> - Seed une œuvre spécifique
    """
    try:
        import subprocess
        import json as json_module
        
        # Construire la commande Python
        script_path = Path(__file__).parent.parent / 'seed_narrations_dynamic.py'
        
        if not script_path.exists():
            return jsonify({
                'success': False,
                'error': f'Script seed introuvable: {script_path}'
            }), 404
        
        # Exécuter le script Python
        result = subprocess.run(
            ['python', str(script_path)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            return jsonify({
                'success': False,
                'error': f'Script seed failed: {result.stderr}'
            }), 500
        
        # Parser la sortie pour extraire les stats
        output = result.stdout
        inserted = 0
        skipped = 0
        
        # Chercher les lignes de résultat
        for line in output.split('\n'):
            if 'nouvelles narrations insérées' in line:
                try:
                    inserted = int(line.split('-')[1].strip().split()[0])
                except:
                    pass
            if 'combinaisons déjà existantes' in line:
                try:
                    skipped = int(line.split('-')[1].strip().split()[0])
                except:
                    pass
        
        return jsonify({
            'success': True,
            'inserted': inserted,
            'skipped': skipped,
            'message': 'Seed terminé avec succès'
        }), 200
        
    except Exception as e:
        print(f"❌ Erreur seed narrations: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/delete-all-narrations', methods=['DELETE'])
def admin_delete_all_narrations():
    """
    Supprime TOUTES les narrations de la base
    Action irréversible !
    """
    try:
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Compter avant suppression
        cur.execute("SELECT COUNT(*) as count FROM pregenerations")
        result = cur.fetchone()
        count = result['count'] if result else 0
        
        # Supprimer (CASCADE supprimera aussi pregeneration_criterias)
        cur.execute("TRUNCATE TABLE pregenerations CASCADE")
        conn.commit()
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'deleted': count,
            'message': f'{count} narrations supprimées'
        }), 200
        
    except Exception as e:
        print(f"❌ Erreur suppression narrations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== MUSEUM FLOOR PLAN =====

@app.route('/api/museum/floor-plan', methods=['GET'])
def get_floor_plan():
    """
    Récupère le plan du musée (salles avec polygones) pour affichage
    
    Query params optionnels:
        - floor: int (filtrer par étage)
    
    Returns:
        {
            "success": true,
            "rooms": [
                {
                    "entity_id": 1,
                    "name": "Salle 1",
                    "floor": 0,
                    "polygon_points": [{x, y}, ...]
                },
                ...
            ]
        }
    """
    try:
        conn = _connect_postgres()
        cur = conn.cursor()
        
        # Filtrer par étage si spécifié
        floor_filter = request.args.get('floor')
        
        # D'abord, créer un mapping plan_id → floor_num
        cur.execute("""
            SELECT plan_id, nom 
            FROM plans 
            ORDER BY plan_id
        """)
        plan_to_floor = {}
        for idx, row in enumerate(cur.fetchall()):
            plan_to_floor[row['plan_id']] = idx
        
        # Récupérer les salles avec leurs polygones et plan_id
        query = """
            SELECT 
                e.entity_id,
                e.name,
                e.plan_id,
                array_agg(p.x ORDER BY p.ordre) as xs,
                array_agg(p.y ORDER BY p.ordre) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            GROUP BY e.entity_id, e.name, e.plan_id
            ORDER BY e.entity_id
        """
        
        cur.execute(query)
        rows = cur.fetchall()
        
        rooms = []
        for row in rows:
            # Utiliser plan_id pour déterminer l'étage
            floor_num = plan_to_floor.get(row['plan_id'], 0)
            
            # Filtrer par étage si demandé
            if floor_filter is not None and floor_num != int(floor_filter):
                continue
            
            # Construire polygone
            xs = row['xs'] or []
            ys = row['ys'] or []
            polygon_points = [{'x': x, 'y': y} for x, y in zip(xs, ys)]
            
            rooms.append({
                'entity_id': row['entity_id'],
                'name': row['name'],
                'floor': floor_num,
                'polygon_points': polygon_points
            })
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'rooms': rooms
        }), 200
        
    except Exception as e:
        print(f"❌ Erreur récupération floor plan: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== DÉMARRAGE =====

if __name__ == '__main__':
    print("🚀 Démarrage Museum Voice Backend")
    print("📍 Port: 5000")
    print("🗄️  Database: PostgreSQL")
    app.run(host='0.0.0.0', port=5000, debug=True)
