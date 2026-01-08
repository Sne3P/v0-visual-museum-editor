"""
Service de vérification de connectivité

Responsabilités:
- BFS pour trouver chemins entre salles (même étage)
- BFS pour trouver chemins multi-étages (via escaliers)
- Calcul distances réelles via portes/escaliers
- Vérification accessibilité
"""

import math
from collections import deque
from typing import List, Tuple, Optional
import sys
import os

try:
    from ..models import Position, MuseumGraphV2, Waypoint
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models import Position, MuseumGraphV2, Waypoint


class ConnectivityChecker:
    """Vérifie connectivité et trouve chemins optimaux dans le musée"""
    
    def __init__(self, graph: MuseumGraphV2, accessible_only: bool = False):
        self.graph = graph
        self.accessible_only = accessible_only  # Si True, n'utilise que les ascenseurs
    
    def calculate_path_between_points(
        self, 
        from_pos: Position, 
        to_pos: Position
    ) -> Tuple[float, List[Waypoint]]:
        """
        Calcule chemin optimal entre deux positions
        
        Returns:
            (distance, waypoints) - distance=inf si aucun chemin
        """
        waypoints = []
        
        # 1. Porte directe ?
        direct_door = self.graph.get_direct_door(from_pos.room, to_pos.room, from_pos.floor)
        if direct_door and from_pos.floor == to_pos.floor:
            door_waypoint = Waypoint(
                type='door',
                position={'x': direct_door.center_x, 'y': direct_door.center_y, 
                         'floor': direct_door.floor, 'room': from_pos.room},
                entity_id=direct_door.entity_id,
                room_a=direct_door.room_a,
                room_b=direct_door.room_b
            )
            
            dist_to_door = from_pos.distance_to(Position(
                direct_door.center_x, direct_door.center_y, 
                from_pos.room, from_pos.floor
            ))
            dist_from_door = to_pos.distance_to(Position(
                direct_door.center_x, direct_door.center_y,
                to_pos.room, to_pos.floor
            ))
            
            return dist_to_door + dist_from_door, [door_waypoint]
        
        # 2. Même étage : BFS via portes
        if from_pos.floor == to_pos.floor:
            path_found, dist, waypoints = self._find_path_same_floor(
                from_pos.room, to_pos.room, from_pos.floor, from_pos, to_pos
            )
            if path_found:
                return dist, waypoints
        
        # 3. Multi-étage : BFS via escaliers
        path_found, dist, waypoints = self._find_path_multi_floor(
            from_pos.room, from_pos.floor,
            to_pos.room, to_pos.floor,
            from_pos, to_pos
        )
        
        if path_found:
            return dist, waypoints
        
        # Aucun chemin
        return float('inf'), waypoints
    
    def _find_path_same_floor(
        self,
        room_start: int,
        room_end: int,
        floor: int,
        from_pos: Position,
        to_pos: Position
    ) -> Tuple[bool, float, List[Waypoint]]:
        """BFS pour trouver chemin via portes (même étage)"""
        
        queue = deque([(room_start, [], 0)])
        visited = {room_start}
        
        while queue:
            current_room, path_waypoints, dist = queue.popleft()
            
            if current_room == room_end:
                # Chemin trouvé
                total_dist = (
                    from_pos.distance_to(Position(
                        path_waypoints[0].position['x'] if path_waypoints else to_pos.x,
                        path_waypoints[0].position['y'] if path_waypoints else to_pos.y,
                        room_start, floor
                    )) +
                    dist +
                    (to_pos.distance_to(Position(
                        path_waypoints[-1].position['x'] if path_waypoints else from_pos.x,
                        path_waypoints[-1].position['y'] if path_waypoints else from_pos.y,
                        room_end, floor
                    )) if path_waypoints else 0)
                )
                return True, total_dist, path_waypoints
            
            # Explorer portes
            for door in self.graph.get_doors_for_room(current_room):
                if door.floor != floor:
                    continue
                
                next_room = door.room_b if door.room_a == current_room else door.room_a
                
                if next_room not in visited:
                    visited.add(next_room)
                    
                    door_waypoint = Waypoint(
                        type='door',
                        position={'x': door.center_x, 'y': door.center_y,
                                 'floor': door.floor, 'room': current_room},
                        entity_id=door.entity_id,
                        room_a=door.room_a,
                        room_b=door.room_b
                    )
                    
                    new_waypoints = path_waypoints + [door_waypoint]
                    new_dist = dist + 10  # Distance fixe pour traverser porte
                    
                    queue.append((next_room, new_waypoints, new_dist))
        
        return False, float('inf'), []
    
    def _find_path_multi_floor(
        self,
        room_start: int,
        floor_start: int,
        room_end: int,
        floor_end: int,
        from_pos: Position,
        to_pos: Position
    ) -> Tuple[bool, float, List[Waypoint]]:
        """BFS multi-étages via portes ET escaliers"""
        
        queue = deque([(room_start, floor_start, [], 0)])
        visited = {(room_start, floor_start)}
        
        while queue:
            current_room, current_floor, path_waypoints, dist = queue.popleft()
            
            if current_room == room_end and current_floor == floor_end:
                # Calculer distance totale
                total_dist = dist
                if path_waypoints:
                    # Distance départ → premier waypoint
                    first_wp = path_waypoints[0]
                    total_dist += from_pos.distance_to(Position(
                        first_wp.position['x'],
                        first_wp.position['y'],
                        room_start, floor_start
                    ))
                    
                    # Distance dernier waypoint → arrivée
                    last_wp = path_waypoints[-1]
                    total_dist += to_pos.distance_to(Position(
                        last_wp.position['x'],
                        last_wp.position['y'],
                        room_end, floor_end
                    ))
                else:
                    total_dist = from_pos.distance_to(to_pos)
                
                return True, total_dist, path_waypoints
            
            # Explorer portes (même étage)
            for door in self.graph.get_doors_for_room(current_room):
                if door.floor != current_floor:
                    continue
                
                next_room = door.room_b if door.room_a == current_room else door.room_a
                
                if (next_room, current_floor) not in visited:
                    visited.add((next_room, current_floor))
                    
                    door_waypoint = Waypoint(
                        type='door',
                        position={'x': door.center_x, 'y': door.center_y,
                                 'floor': current_floor, 'room': current_room},
                        entity_id=door.entity_id,
                        room_a=door.room_a,
                        room_b=door.room_b
                    )
                    
                    queue.append((
                        next_room, current_floor,
                        path_waypoints + [door_waypoint],
                        dist + 10
                    ))
            
            # Explorer escaliers
            for stair in self.graph.stairways:
                # Filtrer si mode accessible uniquement
                if self.accessible_only and stair.vertical_type != 'elevator':
                    continue  # Ignorer les escaliers, ne prendre que les ascenseurs
                
                # Direction montante
                if stair.room_id_from == current_room and stair.floor_from == current_floor:
                    if (stair.room_id_to, stair.floor_to) not in visited:
                        visited.add((stair.room_id_to, stair.floor_to))
                        
                        stair_start = Waypoint(
                            type='stairway',
                            position={'x': stair.center_x_from, 'y': stair.center_y_from,
                                     'floor': stair.floor_from, 'room': stair.room_id_from},
                            entity_id=stair.entity_id_from,
                            floor_from=stair.floor_from,
                            floor_to=stair.floor_to
                        )
                        
                        stair_exit = Waypoint(
                            type='stairway_exit',
                            position={'x': stair.center_x_to, 'y': stair.center_y_to,
                                     'floor': stair.floor_to, 'room': stair.room_id_to},
                            entity_id=stair.entity_id_to,
                            floor_from=stair.floor_from,
                            floor_to=stair.floor_to
                        )
                        
                        new_waypoints = path_waypoints + [stair_start, stair_exit]
                        # Distance symbolique pour changement d'étage (20m par étage)
                        # NE PAS calculer distance géométrique car plans différents!
                        floor_diff = abs(stair.floor_to - stair.floor_from)
                        escalier_dist = floor_diff * 20
                        
                        queue.append((
                            stair.room_id_to, stair.floor_to,
                            new_waypoints,
                            dist + escalier_dist + 10
                        ))
                
                # Direction descendante
                elif stair.room_id_to == current_room and stair.floor_to == current_floor:
                    if (stair.room_id_from, stair.floor_from) not in visited:
                        visited.add((stair.room_id_from, stair.floor_from))
                        
                        stair_start = Waypoint(
                            type='stairway',
                            position={'x': stair.center_x_to, 'y': stair.center_y_to,
                                     'floor': stair.floor_to, 'room': stair.room_id_to},
                            entity_id=stair.entity_id_to,
                            floor_from=stair.floor_to,
                            floor_to=stair.floor_from
                        )
                        
                        stair_exit = Waypoint(
                            type='stairway_exit',
                            position={'x': stair.center_x_from, 'y': stair.center_y_from,
                                     'floor': stair.floor_from, 'room': stair.room_id_from},
                            entity_id=stair.entity_id_from,
                            floor_from=stair.floor_to,
                            floor_to=stair.floor_from
                        )
                        
                        new_waypoints = path_waypoints + [stair_start, stair_exit]
                        # Distance symbolique pour changement d'étage (20m par étage)
                        # NE PAS calculer distance géométrique car plans différents!
                        floor_diff = abs(stair.floor_from - stair.floor_to)
                        escalier_dist = floor_diff * 20
                        
                        queue.append((
                            stair.room_id_from, stair.floor_from,
                            new_waypoints,
                            dist + escalier_dist + 10
                        ))
        
        return False, float('inf'), []
    
    def check_accessibility(self, artworks: List) -> List:
        """
        Vérifie que toutes les œuvres sont accessibles entre elles
        
        Retourne la liste des œuvres inaccessibles (devrait être vide)
        """
        inaccessible = []
        
        for i, art_a in enumerate(artworks):
            accessible = False
            for j, art_b in enumerate(artworks):
                if i != j:
                    dist, _ = self.calculate_path_between_points(
                        art_a.position, art_b.position
                    )
                    if not math.isinf(dist):
                        accessible = True
                        break
            
            if not accessible and len(artworks) > 1:
                inaccessible.append(art_a)
        
        return inaccessible
