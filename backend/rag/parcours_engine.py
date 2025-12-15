import json
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import time
from collections import defaultdict

# Import pour LLM
try:
    import requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

try:
    from db import get_works_for_parcours, add_parcours, _connect
except ImportError:
    def get_works_for_parcours(*args): return []
    def add_parcours(*args, **kwargs): return 1
    def _connect(*args): pass


@dataclass
class SelectedWork:
    """Représente une œuvre sélectionnée pour le parcours."""
    oeuvre_id: int
    title: str
    summary: str
    room_id: str
    position: str
    estimated_duration: int  # en minutes
    relevance_score: float


@dataclass
class RouteStep:
    """Représente une étape du parcours."""
    room_id: str
    room_name: str
    works: List[SelectedWork]
    estimated_duration: int
    instructions: str


def select_relevant_works(criteria: Dict[str, Any], top_k: int = 10, 
                         db_path: Optional[str] = None) -> List[SelectedWork]:
    """Sélectionne les œuvres les plus pertinentes selon les critères."""
    age_range = criteria.get("age", "13-18").split("-")
    age_min = int(age_range[0]) if len(age_range) > 0 else 13
    age_max = int(age_range[1]) if len(age_range) > 1 else 18
    artwork_type = criteria.get("type", None)
    
    # Récupérer œuvres adaptées
    suitable_works = get_works_for_parcours(age_min, age_max, artwork_type, db_path)
    
    if not suitable_works:
        # Fallback: toutes les œuvres
        try:
            conn = _connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT * FROM Oeuvres WHERE summary IS NOT NULL ORDER BY created_at DESC")
            suitable_works = [dict(row) for row in cur.fetchall()]
            conn.close()
        except:
            suitable_works = []
    
    if not suitable_works:
        return []
    
    # Créer SelectedWork avec scores par défaut
    selected = []
    for work in suitable_works:
        doc_id = work["oeuvre_id"]
        duration = work.get("duration_minutes") or 10  # 10 min par défaut
        
        selected.append(SelectedWork(
            oeuvre_id=doc_id,
            title=work["title"] or "Sans titre",
            summary=work["description"] or "Pas de résumé disponible",
            room_id=work.get("room_id", "unknown"),
            position=work.get("position_in_room", ""),
            estimated_duration=duration,
            relevance_score=0.8  # Score par défaut
        ))
    
    return selected[:top_k]


def plan_museum_route(selected_works: List[SelectedWork], 
                     max_duration: int = 120) -> List[RouteStep]:
    """Planifie un parcours optimisé dans le musée."""
    if not selected_works:
        return []
    
    # Grouper par salle
    works_by_room = defaultdict(list)
    for work in selected_works:
        works_by_room[work.room_id].append(work)
    
    # Calculer durées par salle
    room_durations = {}
    for room_id, works in works_by_room.items():
        total_duration = sum(work.estimated_duration for work in works)
        room_durations[room_id] = total_duration
    
    # Sélectionner salles selon durée max
    visited_rooms = []
    current_duration = 0
    
    # Trier par score moyen
    room_priorities = []
    for room_id, works in works_by_room.items():
        avg_score = sum(work.relevance_score for work in works) / len(works)
        room_priorities.append((room_id, avg_score, room_durations[room_id]))
    
    room_priorities.sort(key=lambda x: x[1], reverse=True)
    
    for room_id, score, duration in room_priorities:
        if current_duration + duration <= max_duration:
            visited_rooms.append(room_id)
            current_duration += duration
    
    # Créer les étapes
    route_steps = []
    for i, room_id in enumerate(visited_rooms):
        room_name = f"Salle {room_id}"
        works_in_room = works_by_room[room_id]
        
        instructions = f"Commencez votre visite par {room_name}" if i == 0 else f"Dirigez-vous vers {room_name}"
        
        route_steps.append(RouteStep(
            room_id=room_id,
            room_name=room_name,
            works=works_in_room,
            estimated_duration=room_durations[room_id],
            instructions=instructions
        ))
    
    return route_steps


def generate_parcours_guide(criteria: Dict[str, Any], 
                           route_steps: List[RouteStep]) -> str:
    """Génère un guide textuel personnalisé du parcours avec LLM."""
    if not route_steps:
        return "Aucun parcours défini."
    
    # Construire le contexte pour le LLM
    total_duration = sum(step.estimated_duration for step in route_steps)
    total_oeuvres = sum(len(step.works) for step in route_steps)
    
    # Extraire les informations du profil visiteur
    age_range = criteria.get('age', 'Adulte')
    interests = ', '.join(criteria.get('interests', ['art']))
    duration = criteria.get('duration', total_duration)
    
    # Détails des étapes pour le LLM
    steps_detail = ""
    for i, step in enumerate(route_steps, 1):
        steps_detail += f"\nÉtape {i} - {step.room_name} ({step.estimated_duration} min):\n"
        for work in step.works:
            # Utiliser le résumé complet, pas juste les 100 premiers caractères
            summary = work.summary if work.summary else "Description non disponible"
            steps_detail += f"  • {work.title} ({work.estimated_duration} min)\n"
            steps_detail += f"    {summary}\n"
    
    # Construire un prompt en français pour guide personnalisé
    prompt = f"""IMPORTANT: Réponds uniquement en FRANÇAIS.

Tu es un guide de musée expert et passionné. Crée un guide de visite personnalisé et DÉTAILLÉ en français pour des visiteurs de {age_range} ans intéressés par {interests}.

PARCOURS DE VISITE ({total_duration} minutes, {total_oeuvres} œuvres):
{steps_detail}

INSTRUCTIONS DÉTAILLÉES:
- Écris TOUT en français avec un style vivant et captivant
- Introduction chaleureuse personnalisée (2-3 phrases)
- Pour CHAQUE œuvre, développe:
  * Contexte historique précis (2-3 phrases)
  * Description visuelle détaillée (couleurs, formes, composition)
  * Anecdote passionnante ou fait marquant de l'histoire de l'œuvre
  * Impact émotionnel ou technique remarquable
  * Conseils d'observation adaptés à {age_range} ans
- Transitions fluides entre les œuvres
- Conclusion engageante avec recommandations
- DÉVELOPPE vraiment chaque section - sois généreux en détails
- 600-800 mots (guide complet et riche)

CRÉE UN GUIDE RICHE ET DÉTAILLÉ EN FRANÇAIS:"""
    
    # Générer avec LLM ou fallback
    return _call_llm(prompt) or _generate_fallback_guide(criteria, route_steps)


def create_parcours(criteria_json: str, museum_mapping_json: str = '{"rooms": []}', 
                   max_duration: int = 120, top_k: int = 8, 
                   model: str = "default", db_path: Optional[str] = None) -> int:
    """Fonction principale pour créer un parcours complet."""
    start_time = time.time()
    
    try:
        # Parser critères
        criteria = json.loads(criteria_json)
        logging.info(f"Critères reçus: {criteria}")
        
        # Sélectionner œuvres
        selected_works = select_relevant_works(criteria, top_k, db_path)
        logging.info(f"Œuvres sélectionnées: {len(selected_works)}")
        
        # Planifier parcours
        route_steps = plan_museum_route(selected_works, max_duration)
        logging.info(f"Parcours planifié: {len(route_steps)} étapes")
        
        # Générer guide
        guide_text = generate_parcours_guide(criteria, route_steps)
        logging.info("Guide textuel généré")
        
        # Sérialiser pour stockage
        selected_works_json = json.dumps([{
            "oeuvre_id": w.oeuvre_id,
            "title": w.title,
            "summary": w.summary,
            "room_id": w.room_id,
            "position": w.position,
            "estimated_duration": w.estimated_duration,
            "relevance_score": w.relevance_score
        } for w in selected_works], ensure_ascii=False)
        
        route_plan_json = json.dumps([{
            "room_id": s.room_id,
            "room_name": s.room_name,
            "works": [w.oeuvre_id for w in s.works],
            "estimated_duration": s.estimated_duration,
            "instructions": s.instructions
        } for s in route_steps], ensure_ascii=False)
        
        total_duration = sum(step.estimated_duration for step in route_steps)
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Stocker en base
        parcours_id = add_parcours(
            criteria=criteria_json,
            museum_mapping=museum_mapping_json,
            selected_works=selected_works_json,
            route_plan=route_plan_json,
            guide_text=guide_text,
            total_duration_minutes=total_duration,
            model_name=model,
            processing_time_ms=processing_time_ms,
            db_path=db_path
        )
        
        logging.info(f"Parcours créé avec ID {parcours_id} (durée: {total_duration} min)")
        return parcours_id
        
    except Exception as e:
        logging.error(f"Erreur création parcours: {e}")
        raise


def _call_llm(prompt: str, model: str = "llama3", max_tokens: int = 2000) -> str:
    """Appel au LLM pour génération de texte personnalisé"""
    if not _HAS_REQUESTS:
        logging.warning("Requests non disponible, utilisation du guide simple")
        return None
    
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 2500,  # Augmenté pour guides complets de 600-800 mots
                    "top_p": 0.9,
                    "repeat_penalty": 1.1
                }
            },
            timeout=180  # Augmenter le timeout pour guide complet
        )
        
        if response.status_code == 200:
            result = response.json()
            generated_text = result.get('response', '').strip()
            if len(generated_text) > 50:  # Seuil plus bas
                logging.info(f"✅ Guide LLM généré: {len(generated_text)} caractères")
                return generated_text
            else:
                logging.warning(f"⚠️ Réponse LLM trop courte: {len(generated_text)} caractères")
        else:
            logging.warning(f"❌ Erreur LLM: HTTP {response.status_code} - {response.text[:100]}")
            
    except requests.exceptions.ConnectionError:
        logging.warning("🔌 Impossible de se connecter à Ollama (localhost:11434). Vérifiez qu'Ollama est démarré.")
    except requests.exceptions.Timeout:
        logging.warning("⏱️ Timeout lors de l'appel au LLM. Le modèle met trop de temps à répondre.")
    except Exception as e:
        logging.warning(f"❌ Erreur appel LLM: {e}")
    
    return None

def _generate_fallback_guide(criteria: Dict[str, Any], route_steps: List[RouteStep]) -> str:
    """Guide de secours en cas d'échec du LLM"""
    age = criteria.get('age', 'tous âges')
    interests = ', '.join(criteria.get('interests', ['art']))
    total_duration = sum(step.estimated_duration for step in route_steps)
    
    guide = f"""🏛️ BIENVENUE DANS VOTRE PARCOURS PERSONNALISÉ !

Ce parcours de {total_duration} minutes a été spécialement conçu pour {age}, en tenant compte de vos intérêts pour {interests}.

"""
    
    for i, step in enumerate(route_steps, 1):
        guide += f"\nÉTAPE {i} - {step.room_name} ({step.estimated_duration} min)\n"
        guide += f"{step.instructions}\n"
        
        for work in step.works:
            guide += f"\n• {work.title}"
            if work.summary:
                # Prendre une partie plus longue du résumé
                summary = work.summary[:200] + "..." if len(work.summary) > 200 else work.summary
                guide += f"\n  {summary}"
            guide += f"\n  ⏱️ Temps conseillé : {work.estimated_duration} minutes\n"
    
    guide += f"\n\n🎆 PROFITEZ DE VOTRE VISITE !"
    guide += f"\nCe parcours met l'accent sur {interests} et est adapté à {age}."
    guide += f"\nPrenez le temps d'observer et n'hésitez pas à revenir sur les œuvres qui vous fascinent !"
    
    return guide


if __name__ == "__main__":
    pass