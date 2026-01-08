"""
Service de sélection intelligente des œuvres

Responsabilités:
- Charger les œuvres candidates depuis la DB
- Calculer le nombre optimal selon durée cible
- Sélection pondérée (variété salles/étages/types)
- Respecter les critères du profil utilisateur
"""

import random
import psycopg2.extras
from typing import List, Dict
import sys
import os
import json

# Support imports directs et relatifs
try:
    from ..models import Artwork, Position, MuseumGraphV2
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models import Artwork, Position, MuseumGraphV2


class ArtworkSelector:
    """Sélectionne les œuvres pour un parcours selon profil et durée"""
    
    def __init__(self, conn, graph: MuseumGraphV2):
        self.conn = conn
        self.graph = graph
    
    def select_artworks(self, profile: Dict, target_duration_min: int, seed: int) -> List[Artwork]:
        """
        Sélectionne les œuvres optimales pour le parcours
        
        Args:
            profile: Critères utilisateur (age, thematique, style_texte)
            target_duration_min: Durée cible en minutes
            seed: Seed pour reproductibilité (optionnel)
        
        Returns:
            Liste d'œuvres sélectionnées
        """
        # Charger toutes les œuvres candidates
        candidates = self._load_candidate_artworks(profile)
        
        if not candidates:
            return []

        # Filtrer par connectivité: garder une seule composante connexe cohérente
        candidates = self._filter_by_connectivity(candidates)
        if not candidates:
            return []
        
        # Calculer nombre optimal d'œuvres selon durée
        target_count = self._calculate_target_count(candidates, target_duration_min)
        
        # Sélection pondérée pour variété
        selected = self._weighted_selection(candidates, target_count, seed)
        
        return selected

    def _filter_by_connectivity(self, candidates: List[Artwork]) -> List[Artwork]:
        """Garde uniquement les œuvres appartenant à une composante connexe valide.

        - Élimine les salles totalement isolées (aucune porte/vertical link)
        - Choisit une composante connexe cible et filtre les œuvres en conséquence
        """
        if not candidates:
            return candidates

        # Construire le graphe salle↔salle (portes) + liens verticaux (étages)
        adj = {}
        def add_edge(a, b):
            if a is None or b is None:
                return
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)

        # Portes même étage
        for door in self.graph.doors:
            add_edge(door.room_a, door.room_b)

        # Liens verticaux (relient les salles à travers étages)
        for s in self.graph.stairways:
            add_edge(s.room_id_from, s.room_id_to)

        # Trouver composantes connexes via BFS
        unvisited = set(self.graph.rooms.keys())
        components = []
        while unvisited:
            start = unvisited.pop()
            comp = set([start])
            queue = [start]
            while queue:
                r = queue.pop()
                for n in adj.get(r, []):
                    if n in unvisited:
                        unvisited.remove(n)
                        comp.add(n)
                        queue.append(n)
            components.append(comp)

        # Retirer les salles totalement isolées (degré 0) de toute considération
        connected_rooms = set()
        for comp in components:
            if len(comp) == 1:
                only = next(iter(comp))
                if len(adj.get(only, set())) == 0:
                    continue  # salle isolée, ignorer
            connected_rooms.update(comp)

        filtered_candidates = [a for a in candidates if a.position.room in connected_rooms]
        if not filtered_candidates:
            return []

        # Choisir une composante cible: prioriser celle qui contient le plus d'œuvres en RDC, sinon la plus dense
        # Indexer œuvres par salle
        artworks_by_room = {}
        for a in filtered_candidates:
            artworks_by_room.setdefault(a.position.room, 0)
            artworks_by_room[a.position.room] += 1

        def component_score(comp):
            ground_room_count = sum(
                1 for r in comp if self.graph.rooms.get(r, {}).get('floor') == 0 and artworks_by_room.get(r, 0) > 0
            )
            total_artworks = sum(artworks_by_room.get(r, 0) for r in comp)
            return (ground_room_count, total_artworks)

        # Garder composante avec meilleur score
        best_comp = max(components, key=component_score)
        final_candidates = [a for a in filtered_candidates if a.position.room in best_comp]

        return final_candidates
    
    def _load_candidate_artworks(self, profile: Dict) -> List[Artwork]:
        """Charge les œuvres avec narrations selon profil"""
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # DEBUG: Logger le profil utilisé
        profile_json = json.dumps(profile)
        print(f"🔍 [SELECTOR DEBUG] Chargement artworks avec profile: {profile_json}")
        
        # Query avec narrations pregenerées
        cur.execute("""
            SELECT DISTINCT
                o.oeuvre_id,
                o.title,
                o.artist,
                o.date_oeuvre,
                o.materiaux_technique,
                p.pregeneration_text as narration,
                p.criteria_combination as criteria_used,
                LENGTH(p.pregeneration_text) as narration_length,
                e_art.entity_id as artwork_entity_id,
                (SELECT AVG(pts.x) FROM points pts WHERE pts.entity_id = e_art.entity_id) as artwork_x,
                (SELECT AVG(pts.y) FROM points pts WHERE pts.entity_id = e_art.entity_id) as artwork_y,
                e_art.plan_id
            FROM oeuvres o
            INNER JOIN entities e_art ON o.oeuvre_id = e_art.oeuvre_id
            INNER JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
            WHERE e_art.entity_type = 'ARTWORK'
              AND p.criteria_combination @> %(profile)s::jsonb
            ORDER BY o.oeuvre_id
        """, {
            'profile': profile_json
        })
        
        artworks = []
        rows = cur.fetchall()
        print(f"📊 [SELECTOR DEBUG] Trouvé {len(rows)} œuvres candidates")
        
        for row in rows:
            # DEBUG: Logger les premières narrations
            narration_preview = row['narration'][:100] if row['narration'] else 'VIDE'
            print(f"📝 [SELECTOR DEBUG] Oeuvre {row['oeuvre_id']}: {narration_preview}...")
            print(f"🔑 [SELECTOR DEBUG] Critères utilisés: {row['criteria_used']}")
            if "lorem" in row['narration'].lower():
                print(f"❌ [SELECTOR DEBUG] LOREM IPSUM DETECTE dans oeuvre {row['oeuvre_id']}!")
            
            # Déterminer étage depuis plan_id
            plan_id = row['plan_id']
            floor = self._get_floor_from_plan(plan_id)
            
            # Trouver salle contenant l'œuvre
            room_id = self.graph._find_room_containing_point(
                row['artwork_x'],
                row['artwork_y'],
                floor
            )
            
            position = Position(
                x=row['artwork_x'],
                y=row['artwork_y'],
                room=room_id,
                floor=floor
            )
            
            artwork_type = self._classify_artwork_type(row['materiaux_technique'])
            
            # Calculer durée narration : nb_mots / 100 WPM * 60 = secondes
            word_count = len(row['narration'].split())
            narration_seconds = (word_count / 100) * 60
            
            artworks.append(Artwork(
                oeuvre_id=row['oeuvre_id'],
                title=row['title'],
                artist=row['artist'],
                artwork_type=artwork_type,
                position=position,
                narration=row['narration'],
                narration_duration=narration_seconds
            ))
        
        cur.close()
        return artworks
    
    def _get_floor_from_plan(self, plan_id: int) -> int:
        """Convertit plan_id en numéro d'étage"""
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT plan_id FROM plans ORDER BY plan_id")
        plans = [row['plan_id'] for row in cur.fetchall()]
        cur.close()
        
        try:
            return plans.index(plan_id)
        except ValueError:
            return 0
    
    def _calculate_target_count(self, candidates: List[Artwork], target_duration_min: int) -> int:
        """Calcule nombre optimal d'œuvres selon durée cible"""
        # Temps moyen par œuvre
        avg_narration = 30  # 30s
        avg_observation = 120  # 2 min
        avg_per_artwork = avg_narration + avg_observation
        
        # Formule : 90% du temps disponible / temps par œuvre
        target_count = min(
            len(candidates),
            int((target_duration_min * 60 * 0.90) / avg_per_artwork)
        )
        
        # Minimum 3 œuvres
        target_count = max(3, target_count)
        
        # Limiter au nombre disponible
        if target_count > len(candidates):
            target_count = len(candidates)
        
        return target_count
    
    def _weighted_selection(self, candidates: List[Artwork], count: int, seed: int) -> List[Artwork]:
        """
        Sélection pondérée favorisant variété
        
        Critères de pondération:
        - Salles différentes (bonus x3)
        - Étages différents (bonus x2)
        - Types variés (bonus x1.5)
        - Distance moyenne optimale
        """
        if len(candidates) <= count:
            return candidates
        
        selected = []
        selected_ids = set()
        visited_rooms = set()
        visited_floors = set()
        type_counts = {}
        
        available = [c for c in candidates]
        
        while len(selected) < count and available:
            if not selected:
                # Premier choix: vraiment aléatoire pour variété
                import time, os
                entropy = int(time.time() * 1000000) ^ os.getpid() ^ hash(time.time())
                temp_random = random.Random(entropy)
                
                # Favoriser RDC si disponible
                ground_floor = [a for a in available if a.position.floor == 0]
                pool = ground_floor if ground_floor else available
                choice = temp_random.choice(pool)
                
                # Seed global pour reproductibilité des autres choix
                if seed is not None:
                    random.seed(seed)
            else:
                # Calcul poids pour chaque candidat
                weights = []
                for candidate in available:
                    # Bonus salle non visitée
                    room_bonus = 3.0 if candidate.position.room not in visited_rooms else 0.5
                    
                    # Bonus étage non visité
                    floor_bonus = 2.0 if candidate.position.floor not in visited_floors else 0.7
                    
                    # Bonus type peu représenté
                    type_count = type_counts.get(candidate.artwork_type, 0)
                    type_bonus = 1.5 if type_count == 0 else (1.0 / (type_count + 1))
                    
                    # Distance moyenne aux déjà sélectionnés
                    avg_dist = sum(candidate.position.distance_to(s.position) for s in selected) / len(selected)
                    distance_weight = min(2.0, avg_dist / 15.0)
                    
                    weights.append(room_bonus * floor_bonus * type_bonus * distance_weight)
                
                if sum(weights) == 0:
                    break
                
                choice = random.choices(available, weights=weights)[0]
            
            # Ajouter au parcours
            selected.append(choice)
            selected_ids.add(choice.oeuvre_id)
            visited_rooms.add(choice.position.room)
            visited_floors.add(choice.position.floor)
            type_counts[choice.artwork_type] = type_counts.get(choice.artwork_type, 0) + 1
            
            # Retirer des disponibles
            available = [a for a in available if a.oeuvre_id != choice.oeuvre_id]
        
        return selected
    
    def _classify_artwork_type(self, materiaux: str) -> str:
        """Classifie le type d'œuvre depuis matériaux"""
        if not materiaux:
            return "Autre"
        
        m = materiaux.lower()
        
        if 'huile' in m or 'toile' in m or 'peinture' in m:
            return "Peinture"
        elif 'bronze' in m or 'marbre' in m or 'sculpture' in m:
            return "Sculpture"
        elif 'photo' in m or 'argentique' in m:
            return "Photographie"
        else:
            return "Autre"
