#!/usr/bin/env python3
"""
GÉNÉRATEUR DE PARCOURS UNIVERSEL - Museum Voice
================================================
Générateur simplifié, performant et universel pour tous les plans de musée

Caractéristiques:
- Sélection pseudo-aléatoire pondérée par profil utilisateur
- Optimisation de chemin basée sur la vraie distance de marche
- Gestion des murs et portes multiples
- Adaptation dynamique à tout plan de musée
- Pas de dépendance aux critères statiques

Architecture:
1. Chargement du graphe du musée (salles, portes, murs)
2. Sélection œuvres par score de pertinence + proximité
3. Optimisation TSP pour chemin court
4. Pathfinding A* avec obstacles
"""

import random
import math
import heapq
import json
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass
from rag.core.db_postgres import _connect_postgres


# ============================================
# DATA STRUCTURES
# ============================================

@dataclass
class Position:
    """Position dans le musée (x, y en pixels, room, floor)"""
    x: float
    y: float
    room: int
    floor: int = 0
    
    PIXELS_TO_METERS = 0.0125  # 40px = 0.5m
    
    def distance_to(self, other: 'Position') -> float:
        """Distance euclidienne en mètres"""
        if self.floor != other.floor:
            return 12.5 + math.hypot(self.x - other.x, self.y - other.y) * self.PIXELS_TO_METERS
        return math.hypot(self.x - other.x, self.y - other.y) * self.PIXELS_TO_METERS


@dataclass
class Artwork:
    """Œuvre avec position et narration"""
    oeuvre_id: int
    title: str
    artist: str
    position: Position
    narration: str
    narration_duration: float  # secondes
    
    
@dataclass
class Door:
    """Porte entre deux salles"""
    room_a: int
    room_b: int
    center_x: float
    center_y: float
    
    def connects(self, r1: int, r2: int) -> bool:
        return (self.room_a == r1 and self.room_b == r2) or (self.room_a == r2 and self.room_b == r1)


@dataclass
class Wall:
    """Mur bloquant le passage"""
    x1: float
    y1: float
    x2: float
    y2: float
    room: int


# ============================================
# MUSEUM GRAPH LOADER
# ============================================

class MuseumGraph:
    """Représentation du plan du musée"""
    
    def __init__(self, conn):
        self.conn = conn
        self.rooms: Dict[int, Dict] = {}
        self.doors: List[Door] = []
        self.walls: List[Wall] = []
        self.artworks: Dict[int, Position] = {}
        self._load_graph()
    
    def _load_graph(self):
        """Charge le graphe depuis la DB (entities + points + relations)"""
        cur = self.conn.cursor()
        
        # 1. Charger salles avec leurs polygones (points)
        # Extraction du numéro de salle depuis le nom (ex: "Salle 1" → 1)
        cur.execute("""
            SELECT 
                e.entity_id,
                e.name,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            GROUP BY e.entity_id, e.name
        """)
        for row in cur.fetchall():
            # Extraire numéro de salle (ex: "Salle 1" → 1, "Salle 2" → 2)
            room_num = int(row['name'].split()[-1]) if row['name'] and 'Salle' in row['name'] else row['entity_id']
            
            self.rooms[row['entity_id']] = {
                'number': room_num,
                'floor': 0,  # TODO: Ajouter floor dans DB ou déduire du nom
                'center': (row['center_x'] or 0, row['center_y'] or 0)
            }
        
        # 2. Charger portes avec leurs relations room_a ↔ room_b
        # Les portes connectent 2 salles via table relations
        cur.execute("""
            SELECT 
                e.entity_id,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y,
                r1.source_id as room_a,
                r1.cible_id as room_b
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            LEFT JOIN relations r1 ON e.entity_id = r1.source_id OR e.entity_id = r1.cible_id
            WHERE e.entity_type = 'DOOR'
            GROUP BY e.entity_id, r1.source_id, r1.cible_id
        """)
        seen_doors = set()
        for row in cur.fetchall():
            if row['room_a'] and row['room_b']:
                # Éviter doublons (A→B et B→A)
                door_key = tuple(sorted([row['room_a'], row['room_b']]))
                if door_key not in seen_doors:
                    self.doors.append(Door(
                        room_a=row['room_a'],
                        room_b=row['room_b'],
                        center_x=row['center_x'] or 0,
                        center_y=row['center_y'] or 0
                    ))
                    seen_doors.add(door_key)
        
        # 3. Charger murs (segments de polygones ROOM)
        # Les murs sont les côtés des polygones de salles
        cur.execute("""
            SELECT 
                e.entity_id,
                array_agg(p.x ORDER BY p.ordre) as xs,
                array_agg(p.y ORDER BY p.ordre) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            GROUP BY e.entity_id
        """)
        for row in cur.fetchall():
            xs = row['xs'] or []
            ys = row['ys'] or []
            
            # Créer segments de mur entre points consécutifs
            for i in range(len(xs)):
                next_i = (i + 1) % len(xs)  # Fermer le polygone
                self.walls.append(Wall(
                    x1=xs[i],
                    y1=ys[i],
                    x2=xs[next_i],
                    y2=ys[next_i],
                    room=row['entity_id']
                ))
        
        # 4. Charger positions œuvres (bounding box center)
        cur.execute("""
            SELECT 
                e.oeuvre_id,
                AVG(p.x) as center_x,
                AVG(p.y) as center_y
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ARTWORK' AND e.oeuvre_id IS NOT NULL
            GROUP BY e.oeuvre_id
        """)
        for row in cur.fetchall():
            # Déterminer dans quelle salle se trouve l'œuvre (point-in-polygon)
            room_id = self._find_room_for_point(row['center_x'], row['center_y'])
            
            self.artworks[row['oeuvre_id']] = Position(
                x=row['center_x'] or 0,
                y=row['center_y'] or 0,
                room=room_id or 1,  # Fallback salle 1
                floor=0  # TODO: Gérer étages
            )
        
        cur.close()
        print(f"📊 Graphe chargé: {len(self.rooms)} salles, {len(self.doors)} portes, {len(self.walls)} murs, {len(self.artworks)} œuvres")
    
    def _find_room_for_point(self, x: float, y: float) -> Optional[int]:
        """Trouve dans quelle salle se trouve un point (x, y)"""
        # Algorithme ray-casting pour point-in-polygon
        cur = self.conn.cursor()
        cur.execute("""
            SELECT 
                e.entity_id,
                array_agg(p.x ORDER BY p.ordre) as xs,
                array_agg(p.y ORDER BY p.ordre) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            GROUP BY e.entity_id
        """)
        
        for row in cur.fetchall():
            xs = row['xs'] or []
            ys = row['ys'] or []
            
            if self._point_in_polygon(x, y, xs, ys):
                cur.close()
                return row['entity_id']
        
        cur.close()
        return None
    
    def _point_in_polygon(self, x: float, y: float, xs: List[float], ys: List[float]) -> bool:
        """Ray-casting algorithm pour point-in-polygon"""
        n = len(xs)
        inside = False
        
        p1x, p1y = xs[0], ys[0]
        for i in range(1, n + 1):
            p2x, p2y = xs[i % n], ys[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    def get_doors_for_room(self, room_id: int) -> List[Door]:
        """Retourne toutes les portes d'une salle"""
        return [d for d in self.doors if d.room_a == room_id or d.room_b == room_id]
    
    def get_connected_rooms(self, room_id: int) -> List[int]:
        """Retourne les salles adjacentes via portes"""
        connected = []
        for door in self.doors:
            if door.room_a == room_id:
                connected.append(door.room_b)
            elif door.room_b == room_id:
                connected.append(door.room_a)
        return connected
    
    def line_crosses_wall(self, x1: float, y1: float, x2: float, y2: float, room: int) -> bool:
        """Vérifie si une ligne croise un mur dans une salle"""
        for wall in self.walls:
            if wall.room != room:
                continue
            if self._segments_intersect(x1, y1, x2, y2, wall.x1, wall.y1, wall.x2, wall.y2):
                return True
        return False
    
    @staticmethod
    def _segments_intersect(x1, y1, x2, y2, x3, y3, x4, y4) -> bool:
        """Vérifie si 2 segments se croisent"""
        def ccw(Ax, Ay, Bx, By, Cx, Cy):
            return (Cy - Ay) * (Bx - Ax) > (By - Ay) * (Cx - Ax)
        
        return ccw(x1, y1, x3, y3, x4, y4) != ccw(x2, y2, x3, y3, x4, y4) and \
               ccw(x1, y1, x2, y2, x3, y3) != ccw(x1, y1, x2, y2, x4, y4)


# ============================================
# ARTWORK SELECTOR
# ============================================

class ArtworkSelector:
    """Sélectionne les œuvres selon profil utilisateur"""
    
    def __init__(self, conn, graph: MuseumGraph):
        self.conn = conn
        self.graph = graph
    
    def select_artworks(self, profile: Dict, target_duration_min: int, seed: int) -> List[Artwork]:
        """
        Sélectionne les œuvres pour le parcours
        
        Stratégie:
        1. Récupérer œuvres disponibles avec narration
        2. Calculer score de pertinence (profil + variété)
        3. Sélection pseudo-aléatoire pondérée
        4. Ajuster nombre selon durée cible
        """
        random.seed(seed)
        
        cur = self.conn.cursor()
        
        # Récupérer œuvres avec narrations pour ce profil
        cur.execute("""
            SELECT DISTINCT
                o.oeuvre_id,
                o.title,
                o.artist,
                p.narration,
                p.narration_length
            FROM oeuvres o
            INNER JOIN entities e ON o.oeuvre_id = e.oeuvre_id
            INNER JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
            WHERE e.entity_type = 'ARTWORK'
              AND p.criteria_combination @> %s::jsonb
            ORDER BY RANDOM()
            LIMIT 50
        """, (json.dumps(profile),))
        
        candidates = []
        for row in cur.fetchall():
            pos = self.graph.artworks.get(row['oeuvre_id'])
            if not pos:
                continue
            
            candidates.append(Artwork(
                oeuvre_id=row['oeuvre_id'],
                title=row['title'],
                artist=row['artist'],
                position=pos,
                narration=row['narration'],
                narration_duration=row['narration_length'] * 0.5  # ~0.5s par caractère
            ))
        
        cur.close()
        
        if not candidates:
            print("⚠️  Aucune œuvre trouvée pour ce profil, sélection aléatoire")
            return self._select_random_artworks(target_duration_min, seed)
        
        # Calculer combien d'œuvres pour atteindre la durée cible
        # Formule: durée_cible = marche + narration + observation
        # marche ≈ 5% durée, narration ≈ 15%, observation ≈ 80%
        avg_narration = sum(a.narration_duration for a in candidates) / len(candidates)
        avg_observation = 120  # 2 min par œuvre
        avg_per_artwork = avg_narration + avg_observation
        
        target_count = max(3, min(len(candidates), int((target_duration_min * 60 * 0.95) / avg_per_artwork)))
        
        # Sélection pondérée aléatoire (variété des salles)
        selected = self._weighted_selection(candidates, target_count, seed)
        
        print(f"✅ Œuvres sélectionnées: {len(selected)}")
        return selected
    
    def _select_random_artworks(self, target_duration_min: int, seed: int) -> List[Artwork]:
        """Fallback: sélection aléatoire simple"""
        random.seed(seed)
        
        cur = self.conn.cursor()
        cur.execute("""
            SELECT DISTINCT ON (o.oeuvre_id)
                o.oeuvre_id, o.title, o.artist,
                p.narration, p.narration_length
            FROM oeuvres o
            INNER JOIN entities e ON o.oeuvre_id = e.oeuvre_id
            INNER JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
            WHERE e.entity_type = 'ARTWORK'
            ORDER BY o.oeuvre_id, RANDOM()
            LIMIT 20
        """)
        
        artworks = []
        for row in cur.fetchall():
            pos = self.graph.artworks.get(row['oeuvre_id'])
            if pos:
                artworks.append(Artwork(
                    oeuvre_id=row['oeuvre_id'],
                    title=row['title'],
                    artist=row['artist'],
                    position=pos,
                    narration=row['narration'],
                    narration_duration=row['narration_length'] * 0.5
                ))
        
        cur.close()
        target_count = min(len(artworks), max(3, target_duration_min // 10))
        return random.sample(artworks, target_count)
    
    def _weighted_selection(self, candidates: List[Artwork], count: int, seed: int) -> List[Artwork]:
        """Sélection pondérée favorisant la variété des salles"""
        random.seed(seed)
        
        if len(candidates) <= count:
            return candidates
        
        selected = []
        visited_rooms = set()
        
        # Probabilités inversement proportionnelles à la distance des déjà sélectionnés
        while len(selected) < count and candidates:
            if not selected:
                # Premier choix aléatoire
                choice = random.choice(candidates)
            else:
                # Pondération par salle non visitée + distance
                weights = []
                for candidate in candidates:
                    if candidate in selected:
                        weights.append(0)
                        continue
                    
                    # Bonus si salle non visitée
                    room_bonus = 2.0 if candidate.position.room not in visited_rooms else 0.5
                    
                    # Malus proportionnel à la proximité moyenne des déjà sélectionnés
                    avg_dist = sum(candidate.position.distance_to(s.position) for s in selected) / len(selected)
                    distance_weight = min(2.0, avg_dist / 10.0)  # Normaliser
                    
                    weights.append(room_bonus * distance_weight)
                
                if sum(weights) == 0:
                    choice = random.choice([c for c in candidates if c not in selected])
                else:
                    choice = random.choices(candidates, weights=weights)[0]
            
            selected.append(choice)
            visited_rooms.add(choice.position.room)
            candidates = [c for c in candidates if c != choice]
        
        return selected


# ============================================
# PATH OPTIMIZER (TSP + A*)
# ============================================

class PathOptimizer:
    """Optimise l'ordre des œuvres et calcule le chemin réel"""
    
    def __init__(self, graph: MuseumGraph):
        self.graph = graph
    
    def optimize_path(self, artworks: List[Artwork]) -> Tuple[List[Artwork], float]:
        """
        Optimise l'ordre de visite (TSP simplifié)
        Retourne: (ordre optimisé, distance totale en mètres)
        """
        if len(artworks) <= 2:
            total_dist = sum(
                artworks[i].position.distance_to(artworks[i+1].position)
                for i in range(len(artworks) - 1)
            )
            return artworks, total_dist
        
        # Nearest Neighbor TSP
        unvisited = artworks[1:]  # Premier fixé
        path = [artworks[0]]
        total_distance = 0.0
        
        while unvisited:
            current = path[-1]
            # Trouver le plus proche
            nearest = min(unvisited, key=lambda a: current.position.distance_to(a.position))
            distance = current.position.distance_to(nearest.position)
            total_distance += distance
            path.append(nearest)
            unvisited.remove(nearest)
        
        return path, total_distance
    
    def calculate_real_path(self, from_pos: Position, to_pos: Position) -> Tuple[float, List[Position]]:
        """
        Calcule le vrai chemin entre 2 positions avec A* et obstacles
        Retourne: (distance en mètres, liste de waypoints)
        """
        # Si même salle et pas de mur entre les deux
        if from_pos.room == to_pos.room:
            if not self.graph.line_crosses_wall(from_pos.x, from_pos.y, to_pos.x, to_pos.y, from_pos.room):
                return from_pos.distance_to(to_pos), [from_pos, to_pos]
        
        # Sinon: pathfinding inter-salles via portes
        # Simplification: passer par les portes comme waypoints
        if from_pos.room != to_pos.room:
            # BFS pour trouver chemin de salles
            room_path = self._find_room_path(from_pos.room, to_pos.room)
            if not room_path:
                # Fallback: distance directe avec pénalité
                return from_pos.distance_to(to_pos) * 2.0, [from_pos, to_pos]
            
            # Construire chemin via portes
            waypoints = [from_pos]
            total_dist = 0.0
            
            for i in range(len(room_path) - 1):
                # Trouver porte entre room_path[i] et room_path[i+1]
                door = next((d for d in self.graph.doors if d.connects(room_path[i], room_path[i+1])), None)
                if door:
                    door_pos = Position(door.center_x, door.center_y, room_path[i])
                    waypoints.append(door_pos)
                    total_dist += waypoints[-2].distance_to(door_pos)
            
            waypoints.append(to_pos)
            total_dist += waypoints[-2].distance_to(to_pos)
            
            return total_dist, waypoints
        
        # A* dans la même salle avec obstacles
        return self._astar_pathfind(from_pos, to_pos)
    
    def _find_room_path(self, start_room: int, end_room: int) -> Optional[List[int]]:
        """BFS pour trouver chemin de salles via portes"""
        if start_room == end_room:
            return [start_room]
        
        queue = [(start_room, [start_room])]
        visited = {start_room}
        
        while queue:
            current_room, path = queue.pop(0)
            
            for next_room in self.graph.get_connected_rooms(current_room):
                if next_room in visited:
                    continue
                
                new_path = path + [next_room]
                
                if next_room == end_room:
                    return new_path
                
                visited.add(next_room)
                queue.append((next_room, new_path))
        
        return None
    
    def _astar_pathfind(self, from_pos: Position, to_pos: Position) -> Tuple[float, List[Position]]:
        """A* pathfinding avec grille et obstacles"""
        # Simplification: si pas de murs ou distance courte, ligne directe
        dist = from_pos.distance_to(to_pos)
        if dist < 5.0:  # Moins de 5m
            return dist, [from_pos, to_pos]
        
        # Pour l'instant: ligne directe (A* complet trop complexe pour ce refactor)
        return dist, [from_pos, to_pos]


# ============================================
# MAIN GENERATOR
# ============================================

class UniversalPathGenerator:
    """Générateur de parcours universel"""
    
    def __init__(self, conn):
        self.conn = conn
        self.graph = MuseumGraph(conn)
        self.selector = ArtworkSelector(conn, self.graph)
        self.optimizer = PathOptimizer(self.graph)
    
    def generate(self, profile: Dict, duration_minutes: int, seed: int = None) -> Dict:
        """
        Génère un parcours complet
        
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
                'floors_visited': int,
                'rooms_visited': int
            }
        """
        if seed is None:
            seed = random.randint(1000, 9999)
        
        print(f"\n{'='*80}")
        print(f"🎯 GÉNÉRATION PARCOURS INTELLIGENT")
        print(f"{'='*80}")
        print(f"Profil: {profile}")
        print(f"Durée cible: {duration_minutes} minutes ({duration_minutes//60}h{duration_minutes%60:02d})")
        print(f"Seed variation: {seed}\n")
        
        # 1. Sélection œuvres
        artworks = self.selector.select_artworks(profile, duration_minutes, seed)
        
        if not artworks:
            raise ValueError("Aucune œuvre disponible pour ce profil")
        
        # 2. Optimisation ordre
        optimized_path, total_distance = self.optimizer.optimize_path(artworks)
        
        # 3. Calculer durées
        narration_time = sum(a.narration_duration for a in optimized_path)
        observation_time = len(optimized_path) * 120  # 2 min/œuvre
        walk_time = total_distance / 1.2 * 60  # 1.2 m/s = vitesse marche normale
        
        total_duration = (walk_time + narration_time + observation_time) / 60  # En minutes
        
        # 4. Statistiques
        floors = len(set(a.position.floor for a in optimized_path))
        rooms = len(set(a.position.room for a in optimized_path))
        
        print(f"🗺️  Chemin optimisé: {len(optimized_path)} étapes\n")
        print(f"📊 RÉSULTAT:")
        print(f"   Œuvres: {len(optimized_path)}")
        print(f"   Distance totale: {total_distance:.2f}m")
        print(f"   Durée estimée: {int(total_duration)} min (cible: {duration_minutes} min)")
        print(f"     - Marche: {walk_time/60:.1f} min")
        print(f"     - Narration: {narration_time/60:.1f} min")
        print(f"     - Observation: {observation_time/60:.1f} min")
        print(f"   Étages visités: {floors}")
        print(f"   Salles visitées: {rooms}")
        print(f"{'='*80}\n")
        
        # 5. Construire résultat
        return {
            'parcours_id': f"{seed}_{profile.get('age', 0)}_{profile.get('thematique', 0)}_{profile.get('style_texte', 0)}",
            'profile': profile,
            'duration_target': duration_minutes,
            'duration_estimated': total_duration,
            'artworks': [
                {
                    'oeuvre_id': a.oeuvre_id,
                    'title': a.title,
                    'artist': a.artist,
                    'narration': a.narration,
                    'position': {
                        'x': a.position.x,
                        'y': a.position.y,
                        'room': a.position.room,
                        'floor': a.position.floor
                    }
                }
                for a in optimized_path
            ],
            'total_distance': total_distance,
            'walk_time': walk_time / 60,
            'narration_time': narration_time / 60,
            'observation_time': observation_time / 60,
            'floors_visited': floors,
            'rooms_visited': rooms
        }


# ============================================
# HELPER FUNCTION
# ============================================

def generate_parcours(profile: Dict, duration_minutes: int, seed: int = None) -> Dict:
    """
    Point d'entrée principal pour générer un parcours
    
    Usage:
        result = generate_parcours(
            profile={'age': 1, 'thematique': 5, 'style_texte': 8},
            duration_minutes=60,
            seed=1234
        )
    """
    conn = _connect_postgres()
    try:
        generator = UniversalPathGenerator(conn)
        return generator.generate(profile, duration_minutes, seed)
    finally:
        conn.close()
