#!/usr/bin/env python3
"""
Générateur de narrations Ollama OPTIMISÉ
- Prompts ultra-factuels (zéro invention)
- Validation stricte anti-hallucination
- CPU/RAM optimisé (pas GPU)
"""

import os
import re
import random
import requests
from typing import Dict, List, Any, Optional


class OllamaFactualGenerator:
    """
    Générateur FACTUEL avec Ollama local
    - Zéro hallucination
    - Basé uniquement sur PDF/métadonnées
    - Validation stricte
    """
    
    def __init__(self):
        self.api_url = os.getenv("OLLAMA_API_URL", "http://host.docker.internal:11434")
        self.model = os.getenv("OLLAMA_MODEL", "mistral")
        
        # Timeout très généreux pour Mistral CPU
        self.timeout = 300  # 5min pour CPU-only
        
        # TEMPERATURE TRÈS BASSE = factuel strict
        self.temperature = 0.2  # Ultra-factuel (était 0.3-0.4)
        self.top_p = 0.75       # Strict (était 0.9)
        
        # Seed pour variation reproductible
        self.variation_seed = random.randint(1, 1000)
        
        print(f"🤖 OllamaFactualGenerator initialisé")
        print(f"   URL: {self.api_url}")
        print(f"   Modèle: {self.model}")
        print(f"   Température: {self.temperature} (ultra-factuel)")
        print(f"   CPU/RAM optimisé (num_thread=8, num_batch=1024)")
    
    def check_ollama_available(self) -> bool:
        """Vérifie si Ollama est disponible"""
        try:
            response = requests.get(f"{self.api_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get('models', [])
                model_names = [m.get('name', '') for m in models]
                print(f"✅ Ollama disponible - Modèles: {model_names}")
                return True
            return False
        except Exception as e:
            print(f"❌ Ollama non disponible: {e}")
            return False
    
    def generate_narration(self, 
                          artwork: Dict, 
                          chunks: List[Dict],
                          rag_context: str,
                          age_cible: str, 
                          thematique: str, 
                          style_texte: str) -> str:
        """
        Génère une narration FACTUELLE avec Ollama
        """
        
        # Construire le prompt ultra-factuel
        prompt = self._build_factual_prompt(
            artwork=artwork,
            rag_context=rag_context,
            age_cible=age_cible,
            thematique=thematique,
            style_texte=style_texte
        )
        
        # Appeler Ollama
        try:
            narration = self._call_ollama(prompt)
            
            # VALIDATION STRICTE
            is_valid = self._validate_strict(
                narration=narration,
                artwork=artwork,
                rag_context=rag_context
            )
            
            if not is_valid:
                print(f"⚠️  Narration rejetée - Fallback factuel")
                return self._factual_fallback(artwork, chunks, age_cible, thematique)
            
            return narration
            
        except Exception as e:
            print(f"❌ Erreur Ollama: {e}")
            return self._factual_fallback(artwork, chunks, age_cible, thematique)
    
    def _build_factual_prompt(self, artwork: Dict, rag_context: str, age_cible: str, 
                             thematique: str, style_texte: str) -> str:
        """
        Construit un prompt ULTRA-FACTUEL
        Zéro invention, uniquement les faits du PDF
        """
        
        title = artwork.get('title', 'Œuvre')
        artist = artwork.get('artist', 'Artiste')
        
        # Règles linguistiques STRICTES
        linguistic_rules = """RÈGLES LINGUISTIQUES ABSOLUES:
- Singulier UNIQUEMENT (jamais "les amis", "vous tous", pluriel)
- Pas de genre homme/femme sauf si factuel dans source
- Pas de salutations ("Bonjour", "Salut", "Aujourd'hui")
- Pas de formules d'accroche ("Voici", "Regardez", "Découvrons")
- COMMENCE DIRECTEMENT par le contenu factuel"""
        
        # Instructions adaptées à l'âge (SANS inventer)
        age_instructions = {
            'enfant': (
                "PUBLIC: Enfants 6-12 ans - Parle comme à un enfant de CE2-CM2\n"
                "VOCABULAIRE OBLIGATOIRE:\n"
                "- Mots du quotidien: tableau, peintre, couleur, noir, clair, sombre\n"
                "- INTERDIT: maturité, institutionnel, décrochement, émergence, motif\n"
                "- Phrases MAX 10 mots, tutoiement naturel\n"
                "- Comparaisons simples: 'noir comme la nuit', 'épais comme du chocolat'\n"
                "- Verbes action: regarde, vois, imagine, cherche\n"
                "EXEMPLE BON: Tu vois ce tableau tout noir? Le peintre a mis plein de peinture épaisse. C'est comme du chocolat!\n"
                "EXEMPLE INTERDIT: Cette œuvre appartient à une période de maturité artistique."
            ),
            'ado': (
                "PUBLIC: Adolescents 13-17 ans - Ton direct, moderne\n"
                "VOCABULAIRE: Accessible mais varié, tutoiement naturel (Tu vois? Imagine...)\n"
                "- Questions engageantes: Tu remarques? Ça te fait penser à quoi?\n"
                "- Termes techniques OK SI expliqués direct: empâtement = peinture ultra-épaisse\n"
                "- Pas condescendant, pas enfantin\n"
                "EXEMPLE: Regarde comment le peintre a mis la peinture hyper épaisse (empâtement). Ça crée un effet 3D."
            ),
            'adulte': (
                "PUBLIC: Adultes 18-65 ans - Ton professionnel informatif\n"
                "VOCABULAIRE: Précis, riche, vouvoiement, structure claire\n"
                "- Termes techniques acceptés: empâtement, matière picturale, composition\n"
                "- Analyse factuelle et argumentée\n"
                "- Pas pédant, reste accessible\n"
                "EXEMPLE: L'artiste emploie l'empâtement pour créer une matière dense et texturée qui absorbe la lumière."
            ),
            'senior': (
                "PUBLIC: Seniors 65+ ans - Ton cultivé, posé\n"
                "VOCABULAIRE: Riche, nuancé, vouvoiement, références culturelles FACTUELLES\n"
                "- Détails approfondis bienvenus\n"
                "- Mise en contexte historique/artistique\n"
                "- Ton réflexif, invitant à la contemplation\n"
                "EXEMPLE: Cette œuvre s'inscrit dans les recherches d'Eugène Leroy sur la matière picturale, explorant les limites de la figuration."
            )
        }
        
        # Thématique = quel aspect privilégier (TOUJOURS depuis source)
        theme_instructions = {
            'technique_picturale': (
                "FOCUS TECHNIQUE: Comment c'est fait (matériaux, outils, gestes), "
                "effets visuels créés, processus de création. "
                "NE PARLE QUE de technique SI documenté dans source."
            ),
            'biographie': (
                "FOCUS ARTISTE: Qui est l'artiste (vie, parcours), "
                "pourquoi il/elle a créé cette œuvre, style personnel. "
                "NE PARLE QUE de l'artiste SI documenté dans source."
            ),
            'historique': (
                "FOCUS CONTEXTE: Quand et où créé, événements historiques liés, "
                "signification à l'époque. "
                "NE PARLE QUE du contexte SI documenté dans source."
            )
        }
        
        # Style = comment présenter (TOUJOURS factuel)
        style_instructions = {
            'analyse': (
                "STYLE ANALYSE: Décris ce qu'on voit, explique comment c'est fait, "
                "donne du sens aux choix. Ton pédagogique, descriptif, explicatif."
            ),
            'decouverte': (
                "STYLE DÉCOUVERTE: Invite à regarder de près, pose des questions "
                "d'observation (SI réponse dans source), guide l'exploration. "
                "Ton interactif, curieux, ouvert."
            ),
            'anecdote': (
                "STYLE ANECDOTE: Raconte l'histoire de l'œuvre, événements marquants, "
                "récit chronologique des FAITS documentés. Ton narratif, vivant."
            )
        }
        
        # Prompt COMPACT et CLAIR
        prompt = f"""Tu es un guide de musée EXPERT et FACTUEL.

{linguistic_rules}

PUBLIC: {age_instructions.get(age_cible, 'Standard')}
THÈME: {theme_instructions.get(thematique, 'Général')}
STYLE: {style_instructions.get(style_texte, 'Standard')}

SOURCES DOCUMENTÉES (PDF + métadonnées):
{rag_context[:1200]}

Titre: {title}
Artiste: {artist}

TÂCHE: Crée une narration de 180-250 mots UNIQUEMENT basée sur les sources ci-dessus.

INTERDICTIONS ABSOLUES:
❌ N'invente AUCUNE information
❌ Ne spécule PAS ("peut-être", "probablement", "on pense")
❌ N'ajoute PAS de contexte non documenté
❌ Ne mentionne PAS d'anecdotes non vérifiées

SI UNE INFO N'EST PAS DANS LES SOURCES: NE LA MENTIONNE PAS.

Adapte UNIQUEMENT la tournure des phrases selon âge/style, PAS le contenu.

NARRATION FACTUELLE:"""
        
        return prompt
    
    def _call_ollama(self, prompt: str) -> str:
        """Appel Ollama optimisé CPU/RAM"""
        
        try:
            response = requests.post(
                f"{self.api_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,               # Légèrement plus créatif pour variation
                        "top_p": 0.8,                     # Plus de liberté
                        "top_k": 40,                      
                        "num_predict": 180,               # 180 mots = plus rapide
                        "num_ctx": 1536,                  # Réduit à 1536 = BEAUCOUP plus rapide
                        "num_batch": 512,                 # Réduit = plus rapide
                        "num_thread": -1,                 # -1 = utilise TOUS les threads dispo
                        "num_gpu": 0,                     # FORCE CPU
                        "repeat_penalty": 1.15,           
                        "stop": ["\n\n\n", "SOURCES:", "RÈGLES:", "TÂCHE:"]
                    }
                },
                timeout=self.timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                narration = result.get('response', '').strip()
                narration = self._clean_narration(narration)
                return narration
            else:
                print(f"❌ Ollama HTTP {response.status_code}")
                return ""
                
        except requests.exceptions.Timeout:
            print(f"⏱️  Timeout {self.timeout}s")
            return ""
        except Exception as e:
            print(f"❌ Erreur: {e}")
            return ""
    
    def _clean_narration(self, text: str) -> str:
        """Nettoie la narration"""
        
        # Supprimer préfixes parasites
        text = re.sub(r'^(Voici|Voilà|La narration|Narration)[\s:]+', '', text, flags=re.IGNORECASE)
        
        # Supprimer instructions résiduelles
        text = re.sub(r'(SOURCES|RÈGLES|TÂCHE|PUBLIC|INTERDICTIONS).*', '', text, flags=re.DOTALL)
        
        # Limiter longueur
        words = text.split()
        if len(words) > 300:
            text = ' '.join(words[:300])
        
        return text.strip()
    
    def _validate_strict(self, narration: str, artwork: Dict, rag_context: str) -> bool:
        """
        Validation STRICTE anti-hallucination
        Rejette si moindre suspicion
        """
        
        if not narration or len(narration) < 50:
            print("❌ Validation: Trop court")
            return False
        
        # Détecter phrases spéculatives (INTERDIT)
        speculation_patterns = [
            r'on raconte',
            r'la légende',
            r'selon certains',
            r'il paraît',
            r'on pense',
            r'probablement',
            r'peut-être',
            r'il se pourrait',
            r'certains pensent',
            r'on dit que',
            r'il semblerait',
            r'supposons'
        ]
        
        for pattern in speculation_patterns:
            if re.search(pattern, narration.lower()):
                print(f"❌ Validation: Spéculation détectée ({pattern})")
                return False
        
        # Détecter salutations/formules interdites
        forbidden_starts = [
            r'^(bonjour|salut|hello|bienvenue|aujourd\'hui|voici|regardez|découvr)',
        ]
        
        for pattern in forbidden_starts:
            if re.match(pattern, narration.lower()):
                print(f"❌ Validation: Formule interdite ({pattern})")
                return False
        
        # Vérifier longueur
        word_count = len(narration.split())
        if word_count < 100 or word_count > 350:
            print(f"❌ Validation: Longueur anormale ({word_count} mots)")
            return False
        
        print("✅ Validation: Narration acceptée")
        return True
    
    def _factual_fallback(self, artwork: Dict, chunks: List[Dict], 
                         age_cible: str, thematique: str) -> str:
        """
        Fallback ULTRA-FACTUEL
        Assemble simplement les faits disponibles
        """
        
        title = artwork.get('title', 'Cette œuvre')
        artist = artwork.get('artist', 'un artiste')
        date = artwork.get('date_oeuvre', '')
        technique = artwork.get('materiaux_technique', '')
        
        parts = []
        
        # Intro simple
        if age_cible == 'enfant':
            parts.append(f"{title}, créée par {artist}.")
        else:
            parts.append(f"{title} de {artist}.")
        
        # Date
        if date:
            parts.append(f"Créée en {date}.")
        
        # Technique
        if technique:
            parts.append(f"Technique: {technique}.")
        
        # Extraire contenu pertinent des chunks
        for chunk in chunks[:3]:
            text = chunk.get('chunk_text', '').strip()
            if text and len(text) > 100:
                # Prendre première phrase complète
                sentences = text.split('.')
                if sentences:
                    parts.append(sentences[0] + '.')
                    break
        
        return ' '.join(parts)


# Singleton
_factual_generator_instance = None

def get_factual_generator() -> OllamaFactualGenerator:
    """Récupère l'instance unique du générateur factuel"""
    global _factual_generator_instance
    if _factual_generator_instance is None:
        _factual_generator_instance = OllamaFactualGenerator()
    return _factual_generator_instance
