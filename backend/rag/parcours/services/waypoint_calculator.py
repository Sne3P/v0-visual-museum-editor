"""
Service de calcul des waypoints

Responsabilités:
- Génération waypoints entre chaque paire d'œuvres
- Utilisation du ConnectivityChecker pour chemins optimaux
- Gestion multi-étages (escaliers)
"""

from typing import List, Dict
import sys
import os

try:
    from ..models import Artwork, Waypoint
    from .connectivity_checker import ConnectivityChecker
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models import Artwork, Waypoint
    from services.connectivity_checker import ConnectivityChecker


class WaypointCalculator:
    """Calcule les waypoints pour un parcours"""
    
    def __init__(self, connectivity_checker: ConnectivityChecker):
        self.checker = connectivity_checker
    
    def calculate_waypoints(self, artworks: List[Artwork]) -> List[Dict]:
        """
        Génère tous les waypoints du parcours
        
        Returns:
            Liste de waypoints (format dict pour sérialisation)
        """
        all_waypoints = []
        
        for i in range(len(artworks) - 1):
            from_artwork = artworks[i]
            to_artwork = artworks[i + 1]
            
            # Chemin entre deux œuvres
            _, waypoints = self.checker.calculate_path_between_points(
                from_artwork.position,
                to_artwork.position
            )
            
            # Convertir en dict
            for wp in waypoints:
                wp_dict = {
                    'type': wp.type,
                    'position': wp.position,
                    'entity_id': wp.entity_id
                }
                
                if wp.type == 'door':
                    wp_dict['room_a'] = wp.room_a
                    wp_dict['room_b'] = wp.room_b
                elif wp.type in ['stairway', 'stairway_exit']:
                    wp_dict['floor_from'] = wp.floor_from
                    wp_dict['floor_to'] = wp.floor_to
                
                all_waypoints.append(wp_dict)
        
        return all_waypoints
    
    def get_waypoints_for_transition(
        self,
        from_artwork: Artwork,
        to_artwork: Artwork
    ) -> List[Waypoint]:
        """Retourne waypoints pour une transition spécifique"""
        _, waypoints = self.checker.calculate_path_between_points(
            from_artwork.position,
            to_artwork.position
        )
        return waypoints
