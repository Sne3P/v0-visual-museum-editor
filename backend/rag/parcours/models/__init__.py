"""
Models pour le système de génération de parcours
"""

from .artwork import Artwork, Position
from .museum_graph import MuseumGraphV2, Door, Stairway
from .path import PathSegment, Waypoint

__all__ = [
    'Artwork',
    'Position',
    'MuseumGraphV2',
    'Door',
    'Stairway',
    'PathSegment',
    'Waypoint'
]
