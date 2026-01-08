"""
Service de construction des segments de chemin

Responsabilités:
- Générer path_segments pour l'affichage frontend
- Segmentation par étage
- Calcul segment_index pour blue highlight
"""

from typing import List, Dict
import sys
import os

try:
    from ..models import Artwork
    from .connectivity_checker import ConnectivityChecker
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models import Artwork
    from services.connectivity_checker import ConnectivityChecker


class SegmentBuilder:
    """Construit les segments de chemin pour visualisation"""
    
    def __init__(self, connectivity_checker: ConnectivityChecker):
        self.checker = connectivity_checker
    
    def build_segments(self, artworks: List[Artwork]) -> List[Dict]:
        """
        Génère tous les segments du parcours
        
        Returns:
            Liste de segments {from, to, distance, floor, segment_index}
        """
        all_segments = []
        
        for i in range(len(artworks) - 1):
            from_artwork = artworks[i]
            to_artwork = artworks[i + 1]
            
            # Chemin complet avec waypoints
            distance, waypoints = self.checker.calculate_path_between_points(
                from_artwork.position,
                to_artwork.position
            )
            
            # Construire segments
            segments = self._create_segments_from_waypoints(
                from_artwork, to_artwork, waypoints, i
            )
            
            all_segments.extend(segments)
        
        return all_segments
    
    def _create_segments_from_waypoints(
        self,
        from_artwork: Artwork,
        to_artwork: Artwork,
        waypoints: List,
        segment_index: int
    ) -> List[Dict]:
        """Crée segments depuis liste de waypoints"""
        segments = []
        
        # Points du parcours: artwork → waypoints → artwork
        points = [
            {
                'x': from_artwork.position.x,
                'y': from_artwork.position.y,
                'floor': from_artwork.position.floor,
                'room': from_artwork.position.room,
                'type': 'artwork'
            }
        ]
        
        for wp in waypoints:
            points.append({
                'x': wp.position['x'],
                'y': wp.position['y'],
                'floor': wp.position['floor'],
                'room': wp.position['room'],
                'type': wp.type
            })
        
        points.append({
            'x': to_artwork.position.x,
            'y': to_artwork.position.y,
            'floor': to_artwork.position.floor,
            'room': to_artwork.position.room,
            'type': 'artwork'
        })
        
        # Créer segments entre points consécutifs
        for j in range(len(points) - 1):
            from_pt = points[j]
            to_pt = points[j + 1]
            
            # Filtre: ne créer segment que si même étage
            # (transitions escaliers gérées par waypoints)
            if from_pt['floor'] == to_pt['floor']:
                import math
                # Calcul distance en pixels puis conversion en mètres
                # Échelle: 0.5m = 40px → 1px = 0.0125m
                dist_pixels = math.sqrt(
                    (to_pt['x'] - from_pt['x'])**2 +
                    (to_pt['y'] - from_pt['y'])**2
                )
                dist = dist_pixels * 0.0125  # Conversion pixels → mètres
                
                segments.append({
                    'from': {
                        'type': from_pt['type'],
                        'x': from_pt['x'],
                        'y': from_pt['y'],
                        'floor': from_pt['floor'],
                        'room': from_pt['room']
                    },
                    'to': {
                        'type': to_pt['type'],
                        'x': to_pt['x'],
                        'y': to_pt['y'],
                        'floor': to_pt['floor'],
                        'room': to_pt['room']
                    },
                    'distance': dist,
                    'floor': from_pt['floor'],
                    'segment_index': segment_index
                })
        
        return segments
