"""
Modèles pour les œuvres et positions
"""

from dataclasses import dataclass
import math

# Échelle de conversion: 0.5m = 40 pixels → 1 pixel = 0.0125m
PIXEL_TO_METER = 0.0125


@dataclass
class Position:
    """Position d'une œuvre ou waypoint dans le musée"""
    x: float
    y: float
    room: int
    floor: int
    
    def distance_to(self, other: 'Position', penalize_floor_change: bool = True) -> float:
        """Calcule distance euclidienne EN MÈTRES avec pénalité optionnelle pour changement d'étage"""
        dx = self.x - other.x
        dy = self.y - other.y
        base_distance_pixels = math.sqrt(dx * dx + dy * dy)
        base_distance_meters = base_distance_pixels * PIXEL_TO_METER
        
        if penalize_floor_change and self.floor != other.floor:
            # Pénalité pour changement d'étage (20m par étage)
            floor_penalty = abs(self.floor - other.floor) * 20
            return base_distance_meters + floor_penalty
        
        return base_distance_meters


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
    date_oeuvre: str = ""  # Date de création
    materiaux_technique: str = ""  # Technique et matériaux
    image_link: str = ""  # Chemin de l'image de l'œuvre
