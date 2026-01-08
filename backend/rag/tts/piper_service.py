"""
Service de génération audio avec Piper TTS
Génère des narrations audio à partir de texte pour les parcours
"""

import os
import logging
import numpy as np
import soundfile as sf
from typing import Optional, Dict, List
from pathlib import Path

logger = logging.getLogger(__name__)

class PiperTTSService:
    """Service de synthèse vocale avec Piper"""
    
    # Modèles disponibles
    MODELS = {
        "fr_FR": {
            "name": "fr_FR-siwis-medium",
            "path": "/app/piper/models/fr_FR/fr_FR-siwis-medium.onnx",
            "language": "fr_FR"
        },
        "en_US": {
            "name": "en_US-ryan-high",
            "path": "/app/piper/models/en_US/en_US-ryan-high.onnx",
            "language": "en_US"
        }
    }
    
    def __init__(self, default_language: str = "fr_FR"):
        """
        Initialise le service Piper TTS
        
        Args:
            default_language: Langue par défaut (fr_FR ou en_US)
        """
        self.default_language = default_language
        self.voice = None
        self.current_model = None
        self.audio_output_dir = "/app/uploads/audio"
        
        # Créer le dossier de sortie
        os.makedirs(self.audio_output_dir, exist_ok=True)
        
        logger.info(f"🎤 PiperTTSService initialisé avec langue: {default_language}")
    
    def _load_model(self, language: str = None) -> None:
        """
        Charge le modèle Piper pour une langue donnée
        
        Args:
            language: Code langue (fr_FR, en_US)
        """
        if language is None:
            language = self.default_language
            
        # Ne recharger que si nécessaire
        if self.current_model == language and self.voice is not None:
            return
            
        if language not in self.MODELS:
            raise ValueError(f"Langue non supportée: {language}. Langues disponibles: {list(self.MODELS.keys())}")
        
        model_info = self.MODELS[language]
        model_path = model_info["path"]
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Modèle Piper introuvable: {model_path}")
        
        logger.info(f"🔄 Chargement du modèle Piper: {model_info['name']}")
        
        try:
            from piper import PiperVoice
            self.voice = PiperVoice.load(model_path)
            self.current_model = language
            logger.info(f"✅ Modèle Piper chargé: {model_info['name']}")
        except Exception as e:
            logger.error(f"❌ Erreur lors du chargement du modèle Piper: {e}")
            raise
    
    def generate_audio(
        self, 
        text: str, 
        output_filename: str,
        parcours_id: int,
        language: str = None
    ) -> Optional[str]:
        """
        Génère un fichier audio à partir du texte
        
        Args:
            text: Texte à synthétiser
            output_filename: Nom du fichier de sortie (sans extension)
            parcours_id: ID du parcours
            language: Langue optionnelle
            
        Returns:
            Chemin relatif du fichier audio généré ou None si erreur
        """
        if not text or not text.strip():
            logger.warning("⚠️ Texte vide, génération audio ignorée")
            return None
        
        # Charger le modèle si nécessaire
        self._load_model(language)
        
        # Créer le dossier du parcours
        parcours_dir = os.path.join(self.audio_output_dir, f"parcours_{parcours_id}")
        os.makedirs(parcours_dir, exist_ok=True)
        
        # Chemin complet du fichier
        output_file = os.path.join(parcours_dir, f"{output_filename}.wav")
        
        try:
            print(f"🎤 [TTS DEBUG] Génération audio: {output_filename}")
            print(f"   📝 [TTS DEBUG] Texte (100 premiers caractères): {text[:100]}...")
            print(f"   📏 [TTS DEBUG] Longueur texte: {len(text)} caractères")
            logger.info(f"🎤 Génération audio: {output_filename}")
            logger.info(f"   📝 Texte (100 premiers caractères): {text[:100]}...")
            logger.info(f"   📏 Longueur texte: {len(text)} caractères")
            
            # Synthèse vocale
            audio_chunks = self.voice.synthesize(text)
            
            # Concaténer les chunks audio
            audio = np.concatenate([
                np.frombuffer(chunk.audio_int16_bytes, dtype=np.int16)
                for chunk in audio_chunks
            ])
            
            # Normalisation et conversion en float32
            audio = audio.astype(np.float32) / 32768.0
            
            # Sauvegarder le fichier WAV
            sf.write(
                output_file,
                audio,
                self.voice.config.sample_rate
            )
            
            # Retourner le chemin relatif
            relative_path = f"/uploads/audio/parcours_{parcours_id}/{output_filename}.wav"
            logger.info(f"✅ Audio généré: {relative_path}")
            
            return relative_path
            
        except Exception as e:
            logger.error(f"❌ Erreur lors de la génération audio pour {output_filename}: {e}")
            return None
    
    def generate_parcours_audio(
        self, 
        parcours_id: int,
        narrations: List[Dict[str, any]],
        language: str = None
    ) -> Dict[int, str]:
        """
        Génère tous les fichiers audio pour un parcours
        
        Args:
            parcours_id: ID du parcours
            narrations: Liste des narrations [{oeuvre_id, narration_text}, ...]
            language: Langue optionnelle
            
        Returns:
            Dictionnaire {oeuvre_id: audio_path}
        """
        # Charger le modèle une seule fois
        self._load_model(language)
        
        audio_paths = {}
        
        logger.info(f"🎵 Génération de {len(narrations)} narrations audio pour parcours {parcours_id}")
        
        for narration in narrations:
            oeuvre_id = narration.get('oeuvre_id')
            text = narration.get('narration_text') or narration.get('text')
            
            if not text:
                logger.warning(f"⚠️ Pas de texte pour oeuvre {oeuvre_id}")
                continue
            
            # Générer le nom de fichier
            filename = f"oeuvre_{oeuvre_id}"
            
            # Générer l'audio
            audio_path = self.generate_audio(
                text=text,
                output_filename=filename,
                parcours_id=parcours_id,
                language=language
            )
            
            if audio_path:
                audio_paths[oeuvre_id] = audio_path
        
        logger.info(f"✅ {len(audio_paths)}/{len(narrations)} audios générés avec succès")
        
        return audio_paths
    
    def cleanup_parcours_audio(self, parcours_id: int) -> bool:
        """
        Supprime tous les fichiers audio d'un parcours
        
        Args:
            parcours_id: ID du parcours
            
        Returns:
            True si succès
        """
        parcours_dir = os.path.join(self.audio_output_dir, f"parcours_{parcours_id}")
        
        if os.path.exists(parcours_dir):
            try:
                import shutil
                shutil.rmtree(parcours_dir)
                logger.info(f"🗑️ Dossier audio supprimé: parcours_{parcours_id}")
                return True
            except Exception as e:
                logger.error(f"❌ Erreur lors de la suppression: {e}")
                return False
        
        return True


# Instance singleton
_piper_service = None

def get_piper_service(language: str = "fr_FR") -> PiperTTSService:
    """Récupère l'instance singleton du service Piper"""
    global _piper_service
    if _piper_service is None:
        _piper_service = PiperTTSService(default_language=language)
    return _piper_service
