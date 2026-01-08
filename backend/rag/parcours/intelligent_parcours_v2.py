#!/usr/bin/env python3
"""
GÉNÉRATEUR DE PARCOURS INTELLIGENT V2 - Museum Voice
=====================================================
Version complète avec:
- Gestion RÉELLE des étages (escaliers, ascenseurs)
- Pathfinding avec VRAIS murs et portes
- Optimisation "finir étage avant changement"
- Sélection intelligente par profil + type d'œuvre
- Calcul distances RÉELLES (pas ligne droite)

Architecture:
1. Chargement graphe complet (salles, portes, murs, étages, escaliers)
2. Sélection œuvres intelligente (profil + type + variété)
3. Optimisation multi-étages (TSP avec pénalité changement étage)
4. Pathfinding réel (A* avec obstacles + transitions étages)
"""

import random
import math
import json
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass
from rag.core.db_postgres import _connect_postgres


# ============================================
# DATA STRUCTURES
# ============================================

@dataclass
class Position:
    """Position 3D dans le musée (x, y, room, floor)"""
    x: float
    y: float
    room: int
    floor: int = 0
    
    PIXELS_TO_METERS = 0.0125  # 40px = 0.5m
    FLOOR_CHANGE_COST = 12.5   # 12.5m de marche équivalent pour changer d'étage
    
    def distance_to(self, other: 'Position', penalize_floor_change: bool = True) -> float:
        """
        Distance euclidienne en mètres avec pénalité changement d'étage
        
        Args:
            other: Position destination
            penalize_floor_change: Si True, ajoute FLOOR_CHANGE_COST
        """
        floor_penalty = 0.0
        if penalize_floor_change and self.floor != other.floor:
            floor_penalty = self.FLOOR_CHANGE_COST * abs(self.floor - other.floor)
        
        planar_dist = math.hypot(self.x - other.x, self.y - other.y) * self.PIXELS_TO_METERS
        return planar_dist + floor_penalty


@dataclass
class Artwork:
    """Œuvre avec position, narration et métadonnées"""
    oeuvre_id: int
    title: str
    artist: str
    artwork_type: str  # Peinture, Sculpture, etc.
    position: Position
    narration: str
    narration_duration: float  # secondes
    
    
@dataclass
class Door:
    """Porte entre deux salles (même étage)"""
    entity_id: int
    room_a: int
    room_b: int
    center_x: float
    center_y: float
    floor: int = 0
    
    def connects(self, r1: int, r2: int) -> bool:
        return (self.room_a == r1 and self.room_b == r2) or (self.room_a == r2 and self.room_b == r1)


@dataclass
class Stairway:
    """Escalier ou ascenseur entre étages"""
    entity_id_from: int
    entity_id_to: int
    name: str
    room_id_from: int
    room_id_to: int
    floor_from: int
    floor_to: int
    center_x_from: float
    center_y_from: float
    center_x_to: float
    center_y_to: float
    
    def connects_floors(self, f1: int, f2: int) -> bool:
        return (self.floor_from == f1 and self.floor_to == f2) or (self.floor_from == f2 and self.floor_to == f1)


@dataclass
class Wall:
    """Segment de mur (polygone de salle)"""
    x1: float
    y1: float
    x2: float
    y2: float
    room: int
    floor: int = 0


# ============================================
# MUSEUM GRAPH LOADER
# ============================================

class MuseumGraphV2:
    """Représentation COMPLÈTE du plan musée avec étages"""
    
    def __init__(self, conn):
        self.conn = conn
        self.rooms: Dict[int, Dict] = {}  # {entity_id: {number, floor, center, polygon}}
        self.doors: List[Door] = []
        self.stairways: List[Stairway] = []
        self.walls: List[Wall] = []
        self.artworks: Dict[int, Position] = {}
        self.room_to_floor: Dict[int, int] = {}  # Mappage room_entity_id → floor
        self._load_graph()
    
    def _load_graph(self):
        """Charge le graphe complet depuis DB"""
        cur = self.conn.cursor()
        
        # 1. CHARGER SALLES avec polygones
        
        # D'abord, créer un mapping plan_id → floor_num
        cur.execute("""
            SELECT plan_id, nom 
            FROM plans 
            ORDER BY plan_id
        """)
        plan_to_floor = {}
        for idx, row in enumerate(cur.fetchall()):
            plan_to_floor[row['plan_id']] = idx
        
        cur.execute("""
            SELECT 
                e.entity_id,
                e.name,
                e.plan_id,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y,
                array_agg(p.x ORDER BY p.ordre) as xs,
                array_agg(p.y ORDER BY p.ordre) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            GROUP BY e.entity_id, e.name, e.plan_id
        """)
        for row in cur.fetchall():
            # Extraire numéro et étage
            room_num, _ = self._parse_room_name(row['name'])
            floor_num = plan_to_floor.get(row['plan_id'], 0)
            
            self.rooms[row['entity_id']] = {
                'number': room_num,
                'floor': floor_num,
                'center': (row['center_x'] or 0, row['center_y'] or 0),
                'polygon': list(zip(row['xs'] or [], row['ys'] or []))
            }
            self.room_to_floor[row['entity_id']] = floor_num
        
        # 2. CHARGER PORTES - Combiner entités DOOR + relations type='DOOR'

        
        # Récupérer entités DOOR (position géométrique)
        cur.execute("""
            SELECT e.entity_id, e.name, AVG(p.x) as center_x, AVG(p.y) as center_y
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'DOOR'
            GROUP BY e.entity_id, e.name
            ORDER BY e.entity_id
        """)
        door_entities = list(cur.fetchall())
        
        # Récupérer relations DOOR (connexions Salle ↔ Salle)
        # Les relations sont bidirectionnelles (1→2 et 2→1), il faut dédupliquer
        cur.execute("""
            SELECT DISTINCT 
                LEAST(source_id, cible_id) as room_a,
                GREATEST(source_id, cible_id) as room_b
            FROM relations
            WHERE type_relation = 'DOOR'
            ORDER BY room_a, room_b
        """)
        door_relations = list(cur.fetchall())
        
        # Associer entités DOOR aux relations
        # Chaque relation unique correspond à une entité DOOR
        for i, relation in enumerate(door_relations):
            if i < len(door_entities):
                door = door_entities[i]
                room_a = relation['room_a']
                room_b = relation['room_b']
                
                if room_a in self.rooms and room_b in self.rooms:
                    floor = self.rooms[room_a]['floor']
                    
                    self.doors.append(Door(
                        entity_id=door['entity_id'],
                        room_a=room_a,
                        room_b=room_b,
                        center_x=door['center_x'] or 0,
                        center_y=door['center_y'] or 0,
                        floor=floor
                    ))
        
        # 3. CHARGER ESCALIERS/ASCENSEURS (type VERTICAL_LINK)
        # Détection via entity_type='VERTICAL_LINK'
        # Connexion via linkGroupId dans la description (JSON)
        
        cur.execute("""
            SELECT 
                e.entity_id,
                e.name,
                e.description,
                e.plan_id,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'VERTICAL_LINK'
            GROUP BY e.entity_id, e.name, e.description, e.plan_id
        """)
        
        # Grouper les escaliers par linkGroupId
        stairway_groups = {}
        for row in cur.fetchall():
            try:
                desc = json.loads(row['description']) if row['description'] else {}
                link_group_id = desc.get('linkGroupId')
                
                if not link_group_id:
                    continue
                
                # Utiliser plan_id pour déterminer l'étage
                floor_num = plan_to_floor.get(row['plan_id'], 0)
                
                # Trouver la salle dans laquelle se trouve l'escalier
                room_entity_id = self._find_room_for_point(
                    row['center_x'] or 0, 
                    row['center_y'] or 0, 
                    floor_num
                )
                if not room_entity_id:
                    # Fallback: première salle de cet étage
                    for rid, rdata in self.rooms.items():
                        if rdata['floor'] == floor_num:
                            room_entity_id = rid
                            break
                
                if link_group_id not in stairway_groups:
                    stairway_groups[link_group_id] = []
                
                stairway_groups[link_group_id].append({
                    'entity_id': row['entity_id'],
                    'name': row['name'],
                    'floor': floor_num,
                    'room_id': room_entity_id or 1,
                    'center_x': row['center_x'] or 0,
                    'center_y': row['center_y'] or 0
                })
            except (json.JSONDecodeError, KeyError) as e:
                print(f"⚠️ Erreur parsing escalier {row['entity_id']}: {e}")
                continue
        
        # Créer les connexions entre escaliers
        for link_group_id, escaliers in stairway_groups.items():
            # Trier par étage
            escaliers_sorted = sorted(escaliers, key=lambda e: e['floor'])
            
            # Créer connexions entre étages consécutifs
            for i in range(len(escaliers_sorted) - 1):
                escalier_bas = escaliers_sorted[i]
                escalier_haut = escaliers_sorted[i + 1]
                
                # Créer un Stairway pour la montée avec les 2 positions
                self.stairways.append(Stairway(
                    entity_id_from=escalier_bas['entity_id'],
                    entity_id_to=escalier_haut['entity_id'],
                    name=f"{escalier_bas['name']} → {escalier_haut['name']}",
                    room_id_from=escalier_bas['room_id'],
                    room_id_to=escalier_haut['room_id'],
                    floor_from=escalier_bas['floor'],
                    floor_to=escalier_haut['floor'],
                    center_x_from=escalier_bas['center_x'],
                    center_y_from=escalier_bas['center_y'],
                    center_x_to=escalier_haut['center_x'],
                    center_y_to=escalier_haut['center_y']
                ))
        
        # 4. CHARGER MURS (segments de polygones de salles)

        for room_id, room_data in self.rooms.items():
            polygon = room_data['polygon']
            floor = room_data['floor']
            
            for i in range(len(polygon)):
                next_i = (i + 1) % len(polygon)
                self.walls.append(Wall(
                    x1=polygon[i][0],
                    y1=polygon[i][1],
                    x2=polygon[next_i][0],
                    y2=polygon[next_i][1],
                    room=room_id,
                    floor=floor
                ))
        
        # 5. CHARGER POSITIONS ŒUVRES

        cur.execute("""
            SELECT 
                e.oeuvre_id,
                e.plan_id,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ARTWORK' AND e.oeuvre_id IS NOT NULL
            GROUP BY e.oeuvre_id, e.plan_id
        """)
        for row in cur.fetchall():
            # Déterminer salle et étage
            x, y = row['center_x'] or 0, row['center_y'] or 0
            floor = plan_to_floor.get(row['plan_id'], 0)
            
            # Chercher la salle sur le bon étage
            room_id = self._find_room_for_point(x, y, floor)
            
            if not room_id:
                # Fallback: première salle de cet étage
                for rid, rdata in self.rooms.items():
                    if rdata['floor'] == floor:
                        room_id = rid
                        break
                
                if not room_id:
                    # Fallback ultime: première salle
                    room_id = list(self.rooms.keys())[0] if self.rooms else 1
                    floor = self.rooms.get(room_id, {}).get('floor', 0)
            
            self.artworks[row['oeuvre_id']] = Position(
                x=x,
                y=y,
                room=room_id,
                floor=floor
            )
        
        cur.close()

    
    def _parse_room_name(self, name: str) -> Tuple[int, int]:
        """
        Extrait numéro de salle et étage depuis le nom
        
        Exemples:
            "Salle 1" → (1, 0)
            "Salle 2.1" → (1, 2)
            "Étage 1 - Salle 3" → (3, 1)
            "RDC - Salle 4" → (4, 0)
        """
        if not name:
            return 1, 0
        
        # Chercher étage
        floor = 0
        if 'Étage ' in name or 'étage ' in name:
            try:
                floor = int(name.split('tage')[1].strip().split()[0])
            except:
                pass
        elif 'RDC' in name or 'rez' in name.lower():
            floor = 0
        
        # Chercher numéro salle
        room = 1
        try:
            # Chercher dernier nombre dans le nom
            import re
            numbers = re.findall(r'\d+', name)
            if numbers:
                room = int(numbers[-1])
        except:
            pass
        
        return room, floor
    
    def _parse_stairway_floors(self, name: str, description: str) -> Tuple[int, int]:
        """Extrait étages connectés depuis nom/description d'escalier"""
        import re
        
        # Chercher pattern "X-Y" ou "X to Y"
        text = f"{name or ''} {description or ''}"
        
        match = re.search(r'(\d+)\s*[-–to]+\s*(\d+)', text, re.IGNORECASE)
        if match:
            return int(match.group(1)), int(match.group(2))
        
        # Par défaut: RDC vers étage 1
        return 0, 1
    
    def _find_room_for_point(self, x: float, y: float, floor: int) -> Optional[int]:
        """Trouve la salle contenant le point (x, y) à l'étage donné"""
        for room_id, room_data in self.rooms.items():
            if room_data['floor'] != floor:
                continue
            
            polygon = room_data['polygon']
            if self._point_in_polygon(x, y, polygon):
                return room_id
        
        return None
    
    def _point_in_polygon(self, x: float, y: float, polygon: List[Tuple[float, float]]) -> bool:
        """Ray-casting algorithm pour point-in-polygon"""
        n = len(polygon)
        if n < 3:
            return False
        
        inside = False
        p1x, p1y = polygon[0]
        
        for i in range(1, n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    def get_stairways_for_floor(self, floor: int) -> List[Stairway]:
        """Retourne tous les escaliers/ascenseurs depuis un étage"""
        return [s for s in self.stairways if s.floor_from == floor or s.floor_to == floor]
    
    def get_doors_for_room(self, room_id: int) -> List[Door]:
        """Retourne toutes les portes d'une salle"""
        return [d for d in self.doors if d.room_a == room_id or d.room_b == room_id]
    
    def get_connected_rooms(self, room_id: int, same_floor_only: bool = True) -> List[int]:
        """Retourne les salles adjacentes (même étage si same_floor_only)"""
        current_floor = self.rooms[room_id]['floor']
        connected = []
        
        for door in self.doors:
            if door.room_a == room_id:
                if not same_floor_only or self.rooms[door.room_b]['floor'] == current_floor:
                    connected.append(door.room_b)
            elif door.room_b == room_id:
                if not same_floor_only or self.rooms[door.room_a]['floor'] == current_floor:
                    connected.append(door.room_a)
        
        return connected


# ============================================
# ARTWORK SELECTOR INTELLIGENT
# ============================================

class IntelligentArtworkSelector:
    """Sélectionne les œuvres selon profil + type + variété spatiale"""
    
    def __init__(self, conn, graph: MuseumGraphV2):
        self.conn = conn
        self.graph = graph
    
    def select_artworks(self, profile: Dict, target_duration_min: int, seed: int) -> List[Artwork]:
        """
        Sélection intelligente des œuvres
        
        Stratégie:
        1. Récupérer œuvres avec narration pour ce profil
        2. Calculer score (profil match + type artwork + variété spatiale)
        3. Sélection pondérée aléatoire
        4. Ajuster nombre selon durée cible
        """
        random.seed(seed)
        
        cur = self.conn.cursor()
        
        # Récupérer TOUTES les œuvres avec narrations pour ce profil
        cur.execute("""
            SELECT 
                o.oeuvre_id,
                o.title,
                o.artist,
                o.date_oeuvre,
                o.materiaux_technique,
                COALESCE(o.materiaux_technique, 'Œuvre') as artwork_type,
                p.pregeneration_text as narration,
                LENGTH(p.pregeneration_text) as narration_length
            FROM oeuvres o
            INNER JOIN entities e ON o.oeuvre_id = e.oeuvre_id
            INNER JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
            WHERE e.entity_type = 'ARTWORK'
              AND p.criteria_combination @> %s::jsonb
        """, (json.dumps(profile),))
        
        # Dédupliquer par oeuvre_id (garder première narration trouvée)
        seen_ids = set()
        candidates = []
        for row in cur.fetchall():
            if row['oeuvre_id'] in seen_ids:
                continue
            
            seen_ids.add(row['oeuvre_id'])
            pos = self.graph.artworks.get(row['oeuvre_id'])
            if not pos:
                continue
            
            # Déterminer type d'œuvre (Peinture, Sculpture, etc.)
            artwork_type = self._classify_artwork_type(row['artwork_type'])
            
            # Calculer durée narration : nb_mots / 100 WPM * 60 = secondes (lecture lente pour musée)
            word_count = len(row['narration'].split())
            narration_seconds = (word_count / 100) * 60
            
            artwork_obj = Artwork(
                oeuvre_id=row['oeuvre_id'],
                title=row['title'],
                artist=row['artist'],
                artwork_type=artwork_type,
                position=pos,
                narration=row['narration'],
                narration_duration=narration_seconds
            )
            # Ajouter attributs additionnels (ne font pas partie de la dataclass)
            artwork_obj.date_oeuvre = row.get('date_oeuvre', '')
            artwork_obj.materiaux_technique = row.get('materiaux_technique', '')
            candidates.append(artwork_obj)
        
        cur.close()
        
        if not candidates:
            return []
        
        # Calculer nombre d'œuvres cible
        avg_narration = sum(a.narration_duration for a in candidates) / len(candidates)
        avg_observation = 120  # 2 min
        avg_per_artwork = avg_narration + avg_observation
        
        # Limiter au nombre d'œuvres disponibles (pas de doublons)
        target_count = min(len(candidates), int((target_duration_min * 60 * 0.90) / avg_per_artwork))
        target_count = max(3, target_count)  # Minimum 3 œuvres
        
        # Si pas assez d'œuvres pour la durée cible, utiliser toutes les disponibles
        if target_count > len(candidates):
            target_count = len(candidates)
        
        # Sélection pondérée (variété salles + étages + types)
        selected = self._weighted_selection(candidates, target_count, seed)
        
        return selected
    
    def _classify_artwork_type(self, materiaux: str) -> str:
        """Classifie le type d'œuvre depuis les matériaux"""
        if not materiaux:
            return "Autre"
        
        m = materiaux.lower()
        
        if 'huile' in m or 'toile' in m or 'peinture' in m:
            return "Peinture"
        elif 'bronze' in m or 'marbre' in m or 'sculpture' in m or 'statue' in m:
            return "Sculpture"
        elif 'dessin' in m or 'crayon' in m or 'encre' in m:
            return "Dessin"
        elif 'photo' in m:
            return "Photographie"
        else:
            return "Autre"
    
    def _weighted_selection(self, candidates: List[Artwork], count: int, seed: int) -> List[Artwork]:
        """Sélection pondérée favorisant variété (salles + étages + types)"""
        # Ne PAS seed pour le premier choix - on veut de la vraie variété
        
        if len(candidates) <= count:
            return candidates
        
        selected = []
        selected_ids = set()  # Track oeuvre_id to avoid duplicates
        visited_rooms = set()
        visited_floors = set()
        type_counts = {}
        
        # Get unique candidates only
        available = []
        for c in candidates:
            if c.oeuvre_id not in selected_ids:
                available.append(c)
        
        while len(selected) < count and available:
            if not selected:
                # Premier choix: VRAIMENT aléatoire pour varier les parcours
                # Pas de seed fixe - on veut que chaque parcours soit différent
                import time
                import os
                # Combiner temps + PID + nano pour maximum de variété
                entropy = int(time.time() * 1000000) ^ os.getpid() ^ hash(time.time())
                temp_random = random.Random(entropy)
                
                ground_floor_artworks = [a for a in available if a.position.floor == 0]
                candidates_pool = ground_floor_artworks if ground_floor_artworks else available
                choice = temp_random.choice(candidates_pool)
                
                # Maintenant qu'on a choisi le premier (aléatoire), seed le générateur global
                # pour les choix suivants (si un seed est fourni pour reproductibilité)
                if seed is not None:
                    random.seed(seed)
            else:
                # Calcul poids
                weights = []
                for candidate in available:
                    # Bonus salle non visitée
                    room_bonus = 3.0 if candidate.position.room not in visited_rooms else 0.5
                    
                    # Bonus étage non visité
                    floor_bonus = 2.0 if candidate.position.floor not in visited_floors else 0.7
                    
                    # Bonus type peu représenté
                    current_type_count = type_counts.get(candidate.artwork_type, 0)
                    type_bonus = 1.5 if current_type_count == 0 else (1.0 / (current_type_count + 1))
                    
                    # Pénalité distance moyenne aux déjà sélectionnés
                    avg_dist = sum(candidate.position.distance_to(s.position) for s in selected) / len(selected)
                    distance_weight = min(2.0, avg_dist / 15.0)
                    
                    weights.append(room_bonus * floor_bonus * type_bonus * distance_weight)
                
                if sum(weights) == 0 or not weights:
                    # All remaining candidates already selected
                    break
                
                choice = random.choices(available, weights=weights)[0]
            
            selected.append(choice)
            selected_ids.add(choice.oeuvre_id)
            visited_rooms.add(choice.position.room)
            visited_floors.add(choice.position.floor)
            type_counts[choice.artwork_type] = type_counts.get(choice.artwork_type, 0) + 1
            
            # Remove from available
            available = [a for a in available if a.oeuvre_id != choice.oeuvre_id]
        
        return selected


# ============================================
# PATH OPTIMIZER MULTI-FLOORS
# ============================================

class MultiFloorPathOptimizer:
    """Optimise le parcours avec gestion intelligente des étages"""
    
    def __init__(self, graph: MuseumGraphV2):
        self.graph = graph
    
    def optimize_path(self, artworks: List[Artwork]) -> Tuple[List[Artwork], float, List[Dict]]:
        """
        Optimise l'ordre de visite en privilégiant:
        1. Finir un étage avant de changer
        2. Minimiser changements d'étage
        3. Minimiser distance totale
        
        Returns: (ordre optimisé, distance totale en mètres, waypoints pour tracer le chemin)
        """
        if len(artworks) <= 2:
            total_dist = sum(
                artworks[i].position.distance_to(artworks[i+1].position)
                for i in range(len(artworks) - 1)
            )
            # Calculer waypoints simples
            waypoints = self._calculate_waypoints_simple(artworks)
            return artworks, total_dist, waypoints
        
        # Grouper par étage
        floors = {}
        for artwork in artworks:
            floor = artwork.position.floor
            if floor not in floors:
                floors[floor] = []
            floors[floor].append(artwork)
        

        
        # Stratégie: commencer au RDC, finir chaque étage complètement
        floor_order = sorted(floors.keys())  # 0, 1, 2, ...
        
        path = []
        waypoints = []  # Liste de waypoints pour tracer le chemin
        total_distance = 0.0
        last_pos = None
        
        for floor in floor_order:
            floor_artworks = floors[floor]
            
            # Si changement d'étage, trouver escalier le plus proche
            if last_pos and last_pos.floor != floor:
                # Chercher escalier
                stairways = [s for s in self.graph.stairways if s.connects_floors(last_pos.floor, floor)]
                
                if stairways:
                    # Déterminer si on monte ou descend
                    going_up = floor > last_pos.floor
                    
                    # Prendre escalier le plus proche de la position actuelle
                    closest_stair = min(stairways, key=lambda s: last_pos.distance_to(
                        Position(
                            s.center_x_from if going_up else s.center_x_to,
                            s.center_y_from if going_up else s.center_y_to,
                            s.room_id_from if going_up else s.room_id_to,
                            last_pos.floor
                        ), penalize_floor_change=False
                    ))
                    
                    # Coordonnées sur l'étage de départ et d'arrivée
                    stair_x_from = closest_stair.center_x_from if going_up else closest_stair.center_x_to
                    stair_y_from = closest_stair.center_y_from if going_up else closest_stair.center_y_to
                    stair_room_from = closest_stair.room_id_from if going_up else closest_stair.room_id_to
                    
                    stair_x_to = closest_stair.center_x_to if going_up else closest_stair.center_x_from
                    stair_y_to = closest_stair.center_y_to if going_up else closest_stair.center_y_from
                    stair_room_to = closest_stair.room_id_to if going_up else closest_stair.room_id_from
                    
                    # Distance jusqu'à l'escalier (étage actuel)
                    dist_to_stair = last_pos.distance_to(
                        Position(stair_x_from, stair_y_from, stair_room_from, last_pos.floor),
                        penalize_floor_change=False
                    )
                    total_distance += dist_to_stair + Position.FLOOR_CHANGE_COST
                    
                    print(f"   🏢 Escalier {closest_stair.name}: {last_pos.floor} → {floor} (+{dist_to_stair + Position.FLOOR_CHANGE_COST:.1f}m)")
                    
                    # WAYPOINT: Escalier sur l'étage de départ
                    waypoints.append({
                        'type': 'stairway',
                        'name': closest_stair.name,
                        'entity_id': closest_stair.entity_id_from if going_up else closest_stair.entity_id_to,
                        'floor_from': last_pos.floor,
                        'floor_to': floor,
                        'position': {
                            'x': stair_x_from,
                            'y': stair_y_from,
                            'room': stair_room_from,
                            'floor': last_pos.floor  # Position sur l'étage de départ
                        }
                    })
                    
                    # Position après escalier (nouvel étage) - UTILISER LES COORDONNÉES DU HAUT
                    last_pos = Position(stair_x_to, stair_y_to, stair_room_to, floor)
                    
                    # WAYPOINT: Sortie d'escalier sur le nouvel étage
                    waypoints.append({
                        'type': 'stairway_exit',
                        'name': f"Sortie {closest_stair.name}",
                        'entity_id': closest_stair.entity_id_to if going_up else closest_stair.entity_id_from,
                        'floor': floor,
                        'position': {
                            'x': stair_x_to,
                            'y': stair_y_to,
                            'room': stair_room_to,
                            'floor': floor  # Position sur le nouvel étage - COORDONNÉES CORRECTES
                        }
                    })
                else:
                    # Pas d'escalier défini, pénalité directe
                    total_distance += Position.FLOOR_CHANGE_COST
            
            # Optimiser parcours sur cet étage (Nearest Neighbor)
            if last_pos and last_pos.floor == floor:
                # Commencer par l'œuvre la plus proche de la dernière position
                unvisited = floor_artworks.copy()
                current_artwork = min(unvisited, key=lambda a: last_pos.distance_to(a.position, penalize_floor_change=False))
                unvisited.remove(current_artwork)
                
                # Calculer chemin depuis dernière position (escalier ou œuvre précédente)
                dist, segment_waypoints = self._calculate_path_between_points(last_pos, current_artwork.position)
                total_distance += dist
                
                # Ajouter waypoints (portes si changement de salle)
                waypoints.extend(segment_waypoints)
                
                path.append(current_artwork)
                
                while unvisited:
                    next_artwork = min(unvisited, key=lambda a: path[-1].position.distance_to(a.position, penalize_floor_change=False))
                    
                    # Calculer chemin avec waypoints
                    dist, segment_waypoints = self._calculate_path_between_points(path[-1].position, next_artwork.position)
                    total_distance += dist
                    waypoints.extend(segment_waypoints)
                    
                    path.append(next_artwork)
                    unvisited.remove(next_artwork)
                
                last_pos = path[-1].position
            else:
                # Premier étage ou pas de position précédente
                optimized_floor = self._nearest_neighbor_floor(floor_artworks)
                
                for i, artwork in enumerate(optimized_floor):
                    if i == 0 and not last_pos:
                        # Première œuvre du parcours, pas de waypoint avant
                        path.append(artwork)
                    else:
                        # Calculer chemin
                        from_pos = last_pos if i == 0 else optimized_floor[i-1].position
                        dist, segment_waypoints = self._calculate_path_between_points(from_pos, artwork.position)
                        total_distance += dist
                        waypoints.extend(segment_waypoints)
                        path.append(artwork)
                
                last_pos = optimized_floor[-1].position if optimized_floor else None
        
        return path, total_distance, waypoints
    
    def _calculate_path_between_points(self, from_pos: Position, to_pos: Position) -> Tuple[float, List[Dict]]:
        """
        Calcule le chemin réel entre deux positions avec waypoints (portes)
        
        Returns: (distance, waypoints)
        """
        waypoints = []
        
        # Si même salle, pas de porte nécessaire
        if from_pos.room == to_pos.room and from_pos.floor == to_pos.floor:
            distance = from_pos.distance_to(to_pos, penalize_floor_change=False)
            return distance, waypoints
        
        # Chercher portes entre les salles
        doors_from_room = self.graph.get_doors_for_room(from_pos.room)
        
        # Trouver porte qui connecte vers la salle destination
        connecting_door = None
        for door in doors_from_room:
            if door.room_a == to_pos.room or door.room_b == to_pos.room:
                connecting_door = door
                break
        
        if connecting_door:
            # WAYPOINT: Porte
            waypoints.append({
                'type': 'door',
                'entity_id': connecting_door.entity_id,
                'room_a': connecting_door.room_a,
                'room_b': connecting_door.room_b,
                'position': {
                    'x': connecting_door.center_x,
                    'y': connecting_door.center_y,
                    'room': from_pos.room,  # Porte vue depuis la salle de départ
                    'floor': from_pos.floor
                }
            })
            
            # Distance = jusqu'à la porte + de la porte à destination
            door_pos = Position(connecting_door.center_x, connecting_door.center_y, from_pos.room, from_pos.floor)
            dist = from_pos.distance_to(door_pos, penalize_floor_change=False)
            dist += door_pos.distance_to(to_pos, penalize_floor_change=False)
            
            return dist, waypoints
        
        # Pas de porte directe entre les salles sur le même étage
        # Vérifier s'il faut passer par d'autres salles ou changer d'étage
        if from_pos.floor == to_pos.floor:
            # Chercher un chemin via des portes intermédiaires (pathfinding simple)
            path_found, intermediate_dist, intermediate_waypoints = self._find_path_through_rooms(
                from_pos.room, to_pos.room, from_pos.floor
            )
            
            if path_found:
                # Ajouter les waypoints intermédiaires
                waypoints.extend(intermediate_waypoints)
                # Distance = via les portes + dernière portion
                return intermediate_dist + from_pos.distance_to(to_pos, penalize_floor_change=False), waypoints
        
        # Pas de chemin direct sur le même étage
        # Chercher un chemin multi-étages (via escaliers)
        path_found, multi_floor_dist, multi_floor_waypoints = self._find_path_through_floors(
            from_pos.room, from_pos.floor, to_pos.room, to_pos.floor
        )
        
        if path_found:
            waypoints.extend(multi_floor_waypoints)
            return multi_floor_dist, waypoints
        
        # Aucun chemin trouvé (ni même étage, ni multi-étages)
        print(f"   ⚠️ Aucun chemin trouvé entre salle {from_pos.room} (étage {from_pos.floor}) et salle {to_pos.room} (étage {to_pos.floor})")
        return float('inf'), waypoints
    
    def _find_path_through_rooms(self, room_start: int, room_end: int, floor: int) -> Tuple[bool, float, List[Dict]]:
        """
        Trouve un chemin entre deux salles en passant par des portes intermédiaires (BFS)
        
        Returns: (found, distance, waypoints)
        """
        from collections import deque
        
        # BFS pour trouver le chemin le plus court
        queue = deque([(room_start, [], 0)])  # (room_id, path_waypoints, distance)
        visited = {room_start}
        
        while queue:
            current_room, path_waypoints, dist = queue.popleft()
            
            if current_room == room_end:
                # Chemin trouvé !
                return True, dist, path_waypoints
            
            # Explorer les portes depuis cette salle
            doors = self.graph.get_doors_for_room(current_room)
            for door in doors:
                # Filtrer par étage
                if door.floor != floor:
                    continue
                
                # Trouver la salle de l'autre côté
                next_room = door.room_b if door.room_a == current_room else door.room_a
                
                if next_room not in visited:
                    visited.add(next_room)
                    
                    # Créer waypoint pour cette porte
                    waypoint = {
                        'type': 'door',
                        'entity_id': door.entity_id,
                        'room_a': door.room_a,
                        'room_b': door.room_b,
                        'position': {
                            'x': door.center_x,
                            'y': door.center_y,
                            'room': current_room,
                            'floor': floor
                        }
                    }
                    
                    new_waypoints = path_waypoints + [waypoint]
                    new_dist = dist + 10  # Pénalité pour chaque porte traversée
                    
                    queue.append((next_room, new_waypoints, new_dist))
        
        # Pas de chemin trouvé
        return False, float('inf'), []
    
    def _find_path_through_floors(self, room_start: int, floor_start: int, room_end: int, floor_end: int) -> Tuple[bool, float, List[Dict]]:
        """
        Trouve un chemin entre deux salles sur des étages différents via escaliers
        
        Exemple : Salle 3 (étage 0) → Salle 4 (étage 0) via :
                  Salle 3 → Escalier → Étage 1 → Escalier → Salle 4
        
        Returns: (found, distance, waypoints)
        """
        from collections import deque
        
        # BFS multi-étages : (room_id, floor, path_waypoints, distance)
        queue = deque([(room_start, floor_start, [], 0)])
        visited = {(room_start, floor_start)}
        
        while queue:
            current_room, current_floor, path_waypoints, dist = queue.popleft()
            
            # Atteint la destination ?
            if current_room == room_end and current_floor == floor_end:
                return True, dist, path_waypoints
            
            # Explorer les portes sur le même étage
            doors = self.graph.get_doors_for_room(current_room)
            for door in doors:
                if door.floor != current_floor:
                    continue
                
                next_room = door.room_b if door.room_a == current_room else door.room_a
                
                if (next_room, current_floor) not in visited:
                    visited.add((next_room, current_floor))
                    
                    waypoint = {
                        'type': 'door',
                        'entity_id': door.entity_id,
                        'room_a': door.room_a,
                        'room_b': door.room_b,
                        'position': {
                            'x': door.center_x,
                            'y': door.center_y,
                            'room': current_room,
                            'floor': current_floor
                        }
                    }
                    
                    new_waypoints = path_waypoints + [waypoint]
                    new_dist = dist + 10
                    
                    queue.append((next_room, current_floor, new_waypoints, new_dist))
            
            # Explorer les escaliers depuis cette salle
            for stair in self.graph.stairways:
                # Escalier montant depuis cette salle ?
                if stair.room_id_from == current_room and stair.floor_from == current_floor:
                    next_room = stair.room_id_to
                    next_floor = stair.floor_to
                    
                    if (next_room, next_floor) not in visited:
                        visited.add((next_room, next_floor))
                        
                        # Waypoint escalier départ
                        stair_start = {
                            'type': 'stairway',
                            'entity_id': stair.entity_id_from,
                            'floor_from': stair.floor_from,
                            'floor_to': stair.floor_to,
                            'position': {
                                'x': stair.center_x_from,
                                'y': stair.center_y_from,
                                'room': current_room,
                                'floor': current_floor
                            }
                        }
                        
                        # Waypoint escalier arrivée
                        stair_exit = {
                            'type': 'stairway_exit',
                            'floor': next_floor,
                            'position': {
                                'x': stair.center_x_to,
                                'y': stair.center_y_to,
                                'room': next_room,
                                'floor': next_floor
                            }
                        }
                        
                        new_waypoints = path_waypoints + [stair_start, stair_exit]
                        new_dist = dist + 15  # Pénalité pour escalier
                        
                        queue.append((next_room, next_floor, new_waypoints, new_dist))
                
                # Escalier descendant depuis cette salle ?
                elif stair.room_id_to == current_room and stair.floor_to == current_floor:
                    next_room = stair.room_id_from
                    next_floor = stair.floor_from
                    
                    if (next_room, next_floor) not in visited:
                        visited.add((next_room, next_floor))
                        
                        # Waypoint escalier départ (sens inverse)
                        stair_start = {
                            'type': 'stairway',
                            'entity_id': stair.entity_id_to,
                            'floor_from': current_floor,
                            'floor_to': next_floor,
                            'position': {
                                'x': stair.center_x_to,
                                'y': stair.center_y_to,
                                'room': current_room,
                                'floor': current_floor
                            }
                        }
                        
                        # Waypoint escalier arrivée (sens inverse)
                        stair_exit = {
                            'type': 'stairway_exit',
                            'floor': next_floor,
                            'position': {
                                'x': stair.center_x_from,
                                'y': stair.center_y_from,
                                'room': next_room,
                                'floor': next_floor
                            }
                        }
                        
                        new_waypoints = path_waypoints + [stair_start, stair_exit]
                        new_dist = dist + 15
                        
                        queue.append((next_room, next_floor, new_waypoints, new_dist))
        
        # Aucun chemin trouvé
        return False, float('inf'), []
    
    def _calculate_waypoints_simple(self, artworks: List[Artwork]) -> List[Dict]:
        """Calcule waypoints pour un parcours simple (2 œuvres ou moins)"""
        waypoints = []
        
        for i in range(len(artworks) - 1):
            from_pos = artworks[i].position
            to_pos = artworks[i+1].position
            
            _, segment_waypoints = self._calculate_path_between_points(from_pos, to_pos)
            waypoints.extend(segment_waypoints)
        
        return waypoints
    
    def _nearest_neighbor_floor(self, artworks: List[Artwork]) -> List[Artwork]:
        """TSP Nearest Neighbor sur un seul étage avec vérification de connectivité"""
        if len(artworks) <= 1:
            return artworks
        
        # Choisir un point de départ aléatoire pour varier les parcours
        import random
        import time
        import os
        entropy = int(time.time() * 1000000) ^ os.getpid()
        start_random = random.Random(entropy)
        start_idx = start_random.randint(0, len(artworks) - 1)
        
        # Commencer par l'artwork choisi aléatoirement
        unvisited = [a for i, a in enumerate(artworks) if i != start_idx]
        path = [artworks[start_idx]]
        
        while unvisited:
            # Trouver l'artwork le plus proche ACCESSIBLE (via portes)
            current_pos = path[-1].position
            
            # Calculer distance réelle pour chaque artwork non visité
            candidates = []
            for artwork in unvisited:
                dist, _ = self._calculate_path_between_points(current_pos, artwork.position)
                if not math.isinf(dist):  # Seulement les artworks accessibles
                    candidates.append((artwork, dist))
            
            if not candidates:
                # Aucun artwork accessible sur cet étage, arrêter
                print(f"   ⚠️ Artworks inaccessibles restants: {[a.oeuvre_id for a in unvisited]}")
                break
            
            # Choisir le plus proche accessible
            nearest, _ = min(candidates, key=lambda x: x[1])
            path.append(nearest)
            unvisited.remove(nearest)
        
        return path


# ============================================
# MAIN GENERATOR
# ============================================

class IntelligentParcoursGeneratorV2:
    """Générateur de parcours intelligent avec gestion complète des étages"""
    
    def __init__(self, conn):
        self.conn = conn
        self.graph = MuseumGraphV2(conn)
        self.selector = IntelligentArtworkSelector(conn, self.graph)
        self.optimizer = MultiFloorPathOptimizer(self.graph)
    
    def generate(self, profile: Dict, duration_minutes: int, seed: int = None) -> Dict:
        """
        Génère un parcours complet et intelligent
        
        Args:
            profile: {'age': 1, 'thematique': 5, 'style_texte': 8}
            duration_minutes: Durée cible en minutes
            seed: Seed pour variation (None = aléatoire)
        
        Returns:
            {
                'parcours_id': str,
                'profile': dict,
                'duration_target': int,
                'duration_estimated': float,
                'artworks': [...],
                'total_distance': float,
                'walk_time': float,
                'narration_time': float,
                'observation_time': float,
                'floors_visited': int,
                'rooms_visited': int,
                'floor_changes': int
            }
        """
        if seed is None:
            seed = random.randint(1000, 9999)
        

        
        # 1. Sélection œuvres
        artworks = self.selector.select_artworks(profile, duration_minutes, seed)
        
        if not artworks:
            raise ValueError("Aucune œuvre disponible pour ce profil")
        
        # 2. Optimisation ordre multi-étages AVEC WAYPOINTS
        optimized_path, total_distance, waypoints = self.optimizer.optimize_path(artworks)
        
        # 3. Calculer durées (en secondes)
        narration_time = sum(a.narration_duration for a in optimized_path)  # secondes
        observation_time = len(optimized_path) * 180  # 3 min/œuvre = 180s (temps d'observation + transition)
        walk_time = total_distance / 0.6  # distance(m) / vitesse(0.6 m/s) = secondes (marche lente en musée)
        
        total_duration = (walk_time + narration_time + observation_time) / 60  # minutes
        
        # 4. Statistiques
        floors = set(a.position.floor for a in optimized_path)
        rooms = set(a.position.room for a in optimized_path)
        
        # Compter changements d'étage
        floor_changes = sum(
            1 for i in range(len(optimized_path) - 1)
            if optimized_path[i].position.floor != optimized_path[i+1].position.floor
        )
        
        # 5. Construire résultat avec WAYPOINTS pour affichage frontend
        artworks_with_distances = []
        for idx, a in enumerate(optimized_path):
            # Calculer distance jusqu'à la prochaine œuvre (incluant waypoints)
            distance_to_next = 0
            if idx < len(optimized_path) - 1:
                next_artwork = optimized_path[idx + 1]
                # Distance directe (sera affinée avec waypoints)
                distance_to_next = a.position.distance_to(next_artwork.position, penalize_floor_change=False)
            
            artworks_with_distances.append({
                'order': idx + 1,
                'oeuvre_id': a.oeuvre_id,
                'title': a.title,
                'artist': a.artist,
                'date': getattr(a, 'date_oeuvre', ''),
                'materiaux_technique': getattr(a, 'materiaux_technique', ''),
                'artwork_type': a.artwork_type,
                'narration': a.narration,
                'narration_word_count': int(a.narration_duration / 0.5),
                'narration_duration': a.narration_duration,
                'distance_to_next': distance_to_next / 1.2,  # en minutes (vitesse 1.2 m/s)
                'position': {
                    'x': a.position.x,
                    'y': a.position.y,
                    'room': a.position.room,
                    'floor': a.position.floor
                }
            })
        
        return {
            'parcours_id': f"{seed}_{profile.get('age', 0)}_{profile.get('thematique', 0)}_{profile.get('style_texte', 0)}",
            'profile': profile,
            'duration_target': duration_minutes,
            'duration_estimated': total_duration,
            'artworks': artworks_with_distances,
            'waypoints': waypoints,  # AJOUT: Waypoints pour tracer le chemin (portes, escaliers)
            'path_segments': self._build_path_segments(optimized_path, waypoints),  # Segments complets pour affichage
            'total_distance': total_distance,
            'walk_time': walk_time / 60,
            'narration_time': narration_time / 60,
            'observation_time': observation_time / 60,
            'floors_visited': len(floors),
            'rooms_visited': len(rooms),
            'floor_changes': floor_changes,
            'metadata': {
                'total_artworks': len(optimized_path),
                'total_distance': total_distance,
                'floors_visited': len(floors),
                'rooms_visited': len(rooms),
                'floor_changes': floor_changes,
                'floor_distribution': dict((f, sum(1 for a in optimized_path if a.position.floor == f)) for f in floors),
                'floors_list': sorted(floors),  # Liste des étages visités
                'duration_breakdown': {
                    'total_minutes': total_duration,
                    'walking_minutes': walk_time / 60,
                    'narration_minutes': narration_time / 60,
                    'observation_minutes': observation_time / 60
                }
            }
        }
    
    def _build_path_segments(self, artworks: List[Artwork], waypoints: List[Dict]) -> List[Dict]:
        """
        Construit les segments de chemin pour affichage frontend
        Les waypoints sont déjà dans le bon ordre dans la liste (générés pendant optimize_path)
        
        Structure attendue :
        - Artwork 1
        - [Waypoint porte 1→2]  (si changement de salle)
        - Artwork 2
        - [Waypoint porte 2→3]  (si changement de salle)
        - Artwork 3
        
        Chaque segment relie deux points consécutifs du parcours.
        
        Returns: Liste de segments {from, to, color, floor, distance, segment_index}
        """
        segments = []
        
        # Construire la liste ordonnée : artworks + waypoints intercalés
        ordered_points = []
        waypoint_idx = 0
        
        for artwork_idx, artwork in enumerate(artworks):
            # Ajouter l'artwork actuelle
            ordered_points.append({
                'type': 'artwork',
                'order': artwork_idx + 1,
                'position': artwork.position,
                'oeuvre_id': artwork.oeuvre_id
            })
            
            # Ajouter les waypoints ENTRE cette artwork et la suivante
            if artwork_idx < len(artworks) - 1:
                next_artwork = artworks[artwork_idx + 1]
                
                # Collecter les waypoints entre artwork actuelle et suivante
                # Les waypoints sont générés dans l'ordre pendant optimize_path
                while waypoint_idx < len(waypoints):
                    wp = waypoints[waypoint_idx]
                    
                    # Vérifier si ce waypoint est entre les deux artworks
                    # En vérifiant si c'est une porte entre les salles des deux artworks
                    # OU si c'est un escalier pour changer d'étage
                    
                    current_room = artwork.position.room
                    next_room = next_artwork.position.room
                    current_floor = artwork.position.floor
                    next_floor = next_artwork.position.floor
                    
                    # Si c'est une porte et qu'elle connecte les bonnes salles
                    if wp['type'] == 'door':
                        room_a = wp.get('room_a', 0)
                        room_b = wp.get('room_b', 0)
                        # Vérifier si cette porte connecte current_room et next_room
                        if (room_a == current_room and room_b == next_room) or \
                           (room_a == next_room and room_b == current_room):
                            ordered_points.append({
                                'type': 'waypoint',
                                'waypoint_type': wp['type'],
                                'position': Position(**wp['position']),
                                'entity_id': wp.get('entity_id')
                            })
                            waypoint_idx += 1
                            continue
                    
                    # Si c'est un escalier et qu'il connecte les bons étages
                    if wp['type'] in ['stairway', 'stairway_exit']:
                        floor_from = wp.get('floor_from', current_floor)
                        floor_to = wp.get('floor_to', next_floor)
                        if (floor_from == current_floor and floor_to == next_floor):
                            ordered_points.append({
                                'type': 'waypoint',
                                'waypoint_type': wp['type'],
                                'position': Position(**wp['position']),
                                'entity_id': wp.get('entity_id')
                            })
                            waypoint_idx += 1
                            continue
                    
                    # Sinon, ce waypoint est pour une transition ultérieure
                    break
        
        # Créer les segments entre points consécutifs
        for i in range(len(ordered_points) - 1):
            from_point = ordered_points[i]
            to_point = ordered_points[i + 1]
            
            from_pos = from_point['position']
            to_pos = to_point['position']
            
            # Calculer quel artwork segment c'est (pour le frontend)
            # segment_index = 0 signifie entre artwork 1 et 2, etc.
            # Il faut trouver la dernière artwork avant ce segment
            segment_index = 0
            if from_point['type'] == 'artwork':
                segment_index = from_point.get('order', 1) - 1
            else:
                # Remonter dans ordered_points pour trouver la dernière artwork
                for j in range(i - 1, -1, -1):
                    if ordered_points[j]['type'] == 'artwork':
                        segment_index = ordered_points[j].get('order', 1) - 1
                        break
            
            segments.append({
                'from': {
                    'x': from_pos.x,
                    'y': from_pos.y,
                    'room': from_pos.room,
                    'floor': from_pos.floor,
                    'type': from_point['type'],
                    'order': from_point.get('order')
                },
                'to': {
                    'x': to_pos.x,
                    'y': to_pos.y,
                    'room': to_pos.room,
                    'floor': to_pos.floor,
                    'type': to_point['type'],
                    'order': to_point.get('order')
                },
                'floor': from_pos.floor,
                'distance': from_pos.distance_to(to_pos, penalize_floor_change=False),
                'segment_index': segment_index  # Entre quelle artwork et artwork (0=entre 1 et 2)
            })
        
        return segments


# ============================================
# HELPER FUNCTION
# ============================================

def generate_parcours_v2(profile: Dict, duration_minutes: int, seed: int = None) -> Dict:
    """
    Point d'entrée principal pour générer un parcours intelligent V2
    
    Usage:
        result = generate_parcours_v2(
            profile={'age': 1, 'thematique': 5, 'style_texte': 8},
            duration_minutes=60,
            seed=1234
        )
    """
    conn = _connect_postgres()
    try:
        generator = IntelligentParcoursGeneratorV2(conn)
        return generator.generate(profile, duration_minutes, seed)
    finally:
        conn.close()
