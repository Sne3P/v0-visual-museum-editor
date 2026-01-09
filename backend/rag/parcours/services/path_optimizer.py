"""
Service d'optimisation de parcours

Responsabilités:
- Nearest-neighbor TSP avec variété
- Optimisation multi-étages
- Éviter allers-retours inutiles
- Considérer temps restant et accessibilité
"""

import math
import random
from typing import List, Tuple
import sys
import os

try:
    from ..models import Artwork, Position
    from .connectivity_checker import ConnectivityChecker
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models import Artwork, Position
    from services.connectivity_checker import ConnectivityChecker


class PathOptimizer:
    """Optimise l'ordre des œuvres pour un parcours cohérent"""
    
    def __init__(self, connectivity_checker: ConnectivityChecker):
        self.checker = connectivity_checker
    
    def optimize_path(self, artworks: List[Artwork], strategy: str = 'variety_tsp') -> List[Artwork]:
        """
        Optimise l'ordre de visite des œuvres
        
        Args:
            artworks: Œuvres à ordonner
            strategy: 'variety_tsp', 'nearest_neighbor', 'floor_grouping'
        
        Returns:
            Œuvres ordonnées pour parcours optimal
        """
        if len(artworks) <= 1:
            return artworks
        
        if strategy == 'variety_tsp':
            return self._variety_tsp_optimization(artworks)
        elif strategy == 'nearest_neighbor':
            return self._nearest_neighbor_classic(artworks)
        elif strategy == 'floor_grouping':
            return self._floor_then_optimize(artworks)
        else:
            return artworks
    
    def _variety_tsp_optimization(self, artworks: List[Artwork]) -> List[Artwork]:
        """
        TSP avec variété : choisit parmi les 2-3 plus proches à chaque étape
        
        Évite parcours déterministes tout en restant cohérent
        """
        if len(artworks) <= 1:
            return artworks
        
        # Point de départ aléatoire pour variété
        import time, os
        entropy = int(time.time() * 1000000) ^ os.getpid()
        start_random = random.Random(entropy)
        start_idx = start_random.randint(0, len(artworks) - 1)
        
        unvisited = [a for i, a in enumerate(artworks) if i != start_idx]
        path = [artworks[start_idx]]
        
        while unvisited:
            current_pos = path[-1].position
            
            # Calculer distances réelles via BFS
            candidates = []
            for artwork in unvisited:
                dist, _ = self.checker.calculate_path_between_points(
                    current_pos, artwork.position
                )
                if not math.isinf(dist):
                    candidates.append((artwork, dist))
            
            if not candidates:
                print(f"⚠️ Œuvres inaccessibles: {[a.title for a in unvisited]}")
                break
            
            # Trier par distance
            candidates.sort(key=lambda x: x[1])
            
            # Choisir parmi les 3 plus proches (ou moins si <3)
            pool_size = min(3, len(candidates))
            if pool_size == 1:
                chosen = candidates[0][0]
            else:
                # Probabilités: 50% plus proche, 30% 2e, 20% 3e
                weights = [0.5, 0.3, 0.2][:pool_size]
                weights = [w / sum(weights) for w in weights]
                
                chosen = random.choices(
                    [c[0] for c in candidates[:pool_size]],
                    weights=weights
                )[0]
            
            path.append(chosen)
            unvisited.remove(chosen)
        
        return path
    
    def _nearest_neighbor_classic(self, artworks: List[Artwork]) -> List[Artwork]:
        """Nearest-neighbor classique : toujours le plus proche"""
        if len(artworks) <= 1:
            return artworks
        
        # Point de départ aléatoire
        import time, os
        entropy = int(time.time() * 1000000) ^ os.getpid()
        start_random = random.Random(entropy)
        start_idx = start_random.randint(0, len(artworks) - 1)
        
        unvisited = [a for i, a in enumerate(artworks) if i != start_idx]
        path = [artworks[start_idx]]
        
        while unvisited:
            current_pos = path[-1].position
            
            # Trouver plus proche accessible
            min_dist = float('inf')
            nearest = None
            
            for artwork in unvisited:
                dist, _ = self.checker.calculate_path_between_points(
                    current_pos, artwork.position
                )
                if dist < min_dist:
                    min_dist = dist
                    nearest = artwork
            
            if nearest is None:
                print(f"⚠️ Plus d'œuvres accessibles")
                break
            
            path.append(nearest)
            unvisited.remove(nearest)
        
        return path
    
    def _floor_then_optimize(self, artworks: List[Artwork]) -> List[Artwork]:
        """Groupe par étage puis optimise chaque groupe"""
        # Grouper par étage
        by_floor = {}
        for artwork in artworks:
            floor = artwork.position.floor
            if floor not in by_floor:
                by_floor[floor] = []
            by_floor[floor].append(artwork)
        
        # Ordre des étages (RDC en premier généralement)
        floors_sorted = sorted(by_floor.keys())
        
        optimized_path = []
        for floor in floors_sorted:
            floor_artworks = by_floor[floor]
            
            if len(floor_artworks) == 1:
                optimized_path.extend(floor_artworks)
            else:
                # Optimiser ce groupe
                optimized_group = self._variety_tsp_optimization(floor_artworks)
                optimized_path.extend(optimized_group)
        
        return optimized_path
    
    def calculate_total_distance(self, artworks: List[Artwork]) -> float:
        """Calcule distance totale du parcours"""
        if len(artworks) <= 1:
            return 0.0
        
        total = 0.0
        for i in range(len(artworks) - 1):
            dist, _ = self.checker.calculate_path_between_points(
                artworks[i].position,
                artworks[i + 1].position
            )
            total += dist
        
        return total
    
    def estimate_duration(self, artworks: List[Artwork]) -> float:
        """
        Estime durée totale du parcours (minutes)
        
        Formule: narrations + observations + déplacements
        Vitesse de marche: 0.8 m/s (vitesse confortable en musée)
        """
        if not artworks:
            return 0.0
        
        # Temps narrations (en secondes)
        narration_time = sum(a.narration_duration for a in artworks)
        
        # Temps observation (2 min = 120 secondes par œuvre)
        observation_time = len(artworks) * 120
        
        # Temps déplacement (vitesse: 0.8 m/s - vitesse confortable en musée)
        total_distance = self.calculate_total_distance(artworks)
        walking_time = total_distance / 0.8
        
        total_seconds = narration_time + observation_time + walking_time
        
        return total_seconds / 60  # Conversion en minutes
    
    def estimate_walk_time(self, artworks: List[Artwork]) -> float:
        """Estime temps de marche uniquement (minutes)"""
        total_distance = self.calculate_total_distance(artworks)
        return (total_distance / 0.8) / 60  # 0.8 m/s → minutes
