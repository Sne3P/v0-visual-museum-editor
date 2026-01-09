"""
Routes API pour la génération TTS (Text-To-Speech)
Endpoints pour générer les narrations audio des parcours
"""

from flask import Blueprint, request, jsonify
import logging
from ..tts import get_piper_service

logger = logging.getLogger(__name__)

# Blueprint pour les routes TTS
tts_bp = Blueprint('tts', __name__, url_prefix='/api/tts')


@tts_bp.route('/generate', methods=['POST'])
def generate_single_audio():
    """
    Génère un fichier audio unique à partir de texte
    
    Body JSON:
    {
        "text": "Texte à synthétiser",
        "filename": "nom_fichier",
        "parcours_id": 1,
        "language": "fr_FR" (optionnel)
    }
    
    Returns:
        JSON avec le chemin du fichier audio
    """
    try:
        data = request.get_json()
        
        text = data.get('text')
        filename = data.get('filename')
        parcours_id = data.get('parcours_id')
        language = data.get('language', 'fr_FR')
        
        if not text or not filename or not parcours_id:
            return jsonify({
                'success': False,
                'error': 'Paramètres manquants: text, filename, parcours_id requis'
            }), 400
        
        # Récupérer le service Piper
        piper = get_piper_service(language)
        
        # Générer l'audio
        audio_result = piper.generate_audio(
            text=text,
            output_filename=filename,
            parcours_id=parcours_id,
            language=language
        )
        
        if audio_result:
            return jsonify({
                'success': True,
                'audio_path': audio_result['path'],
                'duration_seconds': audio_result['duration_seconds'],
                'filename': f"{filename}.wav"
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Erreur lors de la génération audio'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Erreur génération audio: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@tts_bp.route('/generate-parcours', methods=['POST'])
def generate_parcours_audio():
    """
    Génère tous les fichiers audio pour un parcours complet
    
    Body JSON:
    {
        "parcours_id": 1,
        "narrations": [
            {"oeuvre_id": 1, "narration_text": "..."},
            {"oeuvre_id": 2, "narration_text": "..."}
        ],
        "language": "fr_FR" (optionnel)
    }
    
    Returns:
        JSON avec les chemins de tous les fichiers audio
    """
    try:
        data = request.get_json()
        
        parcours_id = data.get('parcours_id')
        narrations = data.get('narrations', [])
        language = data.get('language', 'fr_FR')
        
        if not parcours_id or not narrations:
            return jsonify({
                'success': False,
                'error': 'Paramètres manquants: parcours_id et narrations requis'
            }), 400
        
        # Récupérer le service Piper
        piper = get_piper_service(language)
        
        # Générer tous les audios
        audio_results = piper.generate_parcours_audio(
            parcours_id=parcours_id,
            narrations=narrations,
            language=language
        )
        
        return jsonify({
            'success': True,
            'parcours_id': parcours_id,
            'audio_count': len(audio_results),
            'audio_paths': {oeuvre_id: data['path'] for oeuvre_id, data in audio_results.items()},
            'audio_durations': {oeuvre_id: data['duration_seconds'] for oeuvre_id, data in audio_results.items()}
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Erreur génération parcours audio: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@tts_bp.route('/cleanup/<int:parcours_id>', methods=['DELETE'])
def cleanup_parcours_audio(parcours_id: int):
    """
    Supprime tous les fichiers audio d'un parcours
    
    Args:
        parcours_id: ID du parcours
        
    Returns:
        JSON de confirmation
    """
    try:
        piper = get_piper_service()
        success = piper.cleanup_parcours_audio(parcours_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Fichiers audio du parcours {parcours_id} supprimés'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Erreur lors de la suppression'
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Erreur cleanup audio: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@tts_bp.route('/health', methods=['GET'])
def health_check():
    """Vérifie que le service TTS est opérationnel"""
    try:
        piper = get_piper_service()
        return jsonify({
            'success': True,
            'service': 'Piper TTS',
            'status': 'operational',
            'default_language': piper.default_language,
            'available_languages': list(piper.MODELS.keys())
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
