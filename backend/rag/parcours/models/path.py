"""
Modèles pour les chemins et waypoints
"""

from dataclasses import dataclass
from typing import Dict, List


@dataclass
class Waypoint:
    """Point intermédiaire (porte, escalier)"""
    type: str  # 'door', 'stairway', 'stairway_exit'
    position: Dict[str, float]  # {x, y, floor, room}
    entity_id: int = None
    room_a: int = None
    room_b: int = None
    floor_from: int = None
    floor_to: int = None


@dataclass
class PathSegment:
    """Segment de chemin entre deux points"""
    from_point: Dict
    to_point: Dict
    distance: float
    floor: int
    segment_index: int  # Indice de transition entre œuvres
