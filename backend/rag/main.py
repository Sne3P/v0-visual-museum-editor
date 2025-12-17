"""
API Flask pour le système structuré d'œuvres d'art
"""

from flask import Flask, request, jsonify
from pathlib import Path
import sys

# Ajouter le répertoire backend au path
sys.path.append(str(Path(__file__).parent))

# Import de base d'abord
print("🔄 Chargement des modules de base...")
from db import (
    init_structured_db, get_artwork, get_all_artworks, 
    search_artworks, get_artwork_sections, get_artwork_anecdotes,
    add_artwork, add_artist, add_artistic_movement,
    add_documentary_section, add_anecdote_structured
)

print("🔄 Chargement du processeur PDF...")
from pdf_processor import process_structured_pdf_file

# Import RAG conditionnel
print("🔄 Chargement du RAG Engine...")
try:
    from rag_engine import StructuredRAGEngine
    print("✅ RAG Engine importé avec succès")
except Exception as e:
    print(f"⚠️ RAG Engine non disponible: {e}")
    StructuredRAGEngine = None

app = Flask(__name__)

# Initialiser la base de données au démarrage
init_structured_db()

# Initialiser le RAG si disponible
rag_engine = None
if StructuredRAGEngine:
    try:
        print("🔄 Initialisation du RAG Engine...")
        rag_engine = StructuredRAGEngine()
        print("✅ RAG Engine initialisé")
    except Exception as e:
        print(f"⚠️ Erreur initialisation RAG: {e}")
        rag_engine = None

# Instance globale du moteur RAG
rag_engine = StructuredRAGEngine()


@app.route('/api/structured/artworks', methods=['GET'])
def get_artworks_list():
    """Récupère la liste de toutes les œuvres"""
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


@app.route('/api/structured/artworks/<int:artwork_id>', methods=['GET'])
def get_artwork_details(artwork_id):
    """Récupère les détails complets d'une œuvre"""
    try:
        artwork = get_artwork(artwork_id)
        if not artwork:
            return jsonify({
                'success': False,
                'error': 'Œuvre non trouvée'
            }), 404
        
        return jsonify({
            'success': True,
            'artwork': artwork
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/structured/search', methods=['GET'])
def search_artworks_api():
    """Recherche d'œuvres par mot-clé"""
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


@app.route('/api/structured/rag/search', methods=['POST'])
def rag_search():
    """Recherche RAG avec réponse générée"""
    try:
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({
                'success': False,
                'error': 'Requête manquante'
            }), 400
        
        query = data['query'].strip()
        max_results = data.get('max_results', 3)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Requête vide'
            }), 400
        
        # Effectuer la recherche RAG
        response = rag_engine.generate_structured_response(query, max_results)
        
        return jsonify({
            'success': True,
            'query': query,
            'response': response['response'],
            'results_found': response['results_found'],
            'artworks': response['artworks']
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/structured/rag/similar', methods=['POST'])
def rag_similar_content():
    """Recherche de contenu similaire sans génération de réponse"""
    try:
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({
                'success': False,
                'error': 'Requête manquante'
            }), 400
        
        query = data['query'].strip()
        top_k = data.get('top_k', 5)
        threshold = data.get('threshold', 0.3)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Requête vide'
            }), 400
        
        # Rechercher le contenu similaire
        results = rag_engine.search_similar_content(query, top_k, threshold)
        
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


@app.route('/api/structured/upload-pdf', methods=['POST'])
def upload_and_process_pdf():
    """Upload et traitement d'un nouveau PDF"""
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'Aucun fichier fourni'
            }), 400
        
        file = request.files['file']
        if file.filename == '' or not file.filename.endswith('.pdf'):
            return jsonify({
                'success': False,
                'error': 'Fichier PDF requis'
            }), 400
        
        # Sauvegarder le fichier
        upload_dir = Path(__file__).parent.parent / "public" / "uploads" / "pdfs"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = upload_dir / file.filename
        file.save(str(file_path))
        
        # Traiter le PDF
        structured_artwork = process_structured_pdf_file(str(file_path))
        
        # Ajouter à l'index RAG
        # Note: L'artwork_id sera disponible après le traitement
        
        return jsonify({
            'success': True,
            'message': 'PDF traité avec succès',
            'artwork': {
                'title': structured_artwork.metadata.title,
                'artist': structured_artwork.metadata.artist,
                'sections_count': len(structured_artwork.sections),
                'anecdotes_count': len(structured_artwork.anecdotes)
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/structured/artworks/<int:artwork_id>/sections', methods=['GET'])
def get_artwork_sections_api(artwork_id):
    """Récupère les sections documentaires d'une œuvre"""
    try:
        section_type = request.args.get('type')
        sections = get_artwork_sections(artwork_id, section_type)
        
        return jsonify({
            'success': True,
            'artwork_id': artwork_id,
            'section_type': section_type,
            'count': len(sections),
            'sections': sections
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/structured/artworks/<int:artwork_id>/anecdotes', methods=['GET'])
def get_artwork_anecdotes_api(artwork_id):
    """Récupère les anecdotes d'une œuvre"""
    try:
        anecdotes = get_artwork_anecdotes(artwork_id)
        
        return jsonify({
            'success': True,
            'artwork_id': artwork_id,
            'count': len(anecdotes),
            'anecdotes': anecdotes
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/structured/rebuild-index', methods=['POST'])
def rebuild_rag_index():
    """Reconstruit l'index RAG complet"""
    try:
        success = rag_engine.rebuild_index()
        
        return jsonify({
            'success': success,
            'message': 'Index reconstruit avec succès' if success else 'Erreurs lors de la reconstruction'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/structured/stats', methods=['GET'])
def get_system_stats():
    """Récupère les statistiques du système"""
    try:
        artworks = get_all_artworks()
        
        # Compter les artistes uniques
        artists = set()
        movements = set()
        
        for artwork in artworks:
            if artwork.get('artist_name'):
                artists.add(artwork['artist_name'])
            if artwork.get('movement_name'):
                movements.add(artwork['movement_name'])
        
        return jsonify({
            'success': True,
            'stats': {
                'total_artworks': len(artworks),
                'unique_artists': len(artists),
                'unique_movements': len(movements),
                'has_rag_index': rag_engine._index is not None,
                'rag_entities_count': len(rag_engine._entity_mapping) if rag_engine._entity_mapping else 0
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint non trouvé'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Erreur interne du serveur'
    }), 500


if __name__ == '__main__':
    print("🚀 Démarrage de l'API structurée...")
    print("📚 Endpoints disponibles:")
    print("  GET  /api/structured/artworks - Liste des œuvres")
    print("  GET  /api/structured/artworks/<id> - Détails d'une œuvre")
    print("  GET  /api/structured/search?q=<query> - Recherche simple")
    print("  POST /api/structured/rag/search - Recherche RAG avec réponse")
    print("  POST /api/structured/rag/similar - Recherche de contenu similaire")
    print("  POST /api/structured/upload-pdf - Upload et traitement PDF")
    print("  POST /api/structured/rebuild-index - Reconstruction index RAG")
    print("  GET  /api/structured/stats - Statistiques du système")
    
    app.run(debug=True, host='0.0.0.0', port=5001)