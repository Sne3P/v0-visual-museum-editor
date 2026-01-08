"""
Graphe du musée : salles, portes, escaliers
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple
import json
import psycopg2


@dataclass
class Door:
    """Porte entre deux salles (même étage)"""
    entity_id: int
    room_a: int
    room_b: int
    center_x: float
    center_y: float
    floor: int


@dataclass
class Stairway:
    """Escalier ou ascenseur reliant deux étages"""
    entity_id_from: int
    entity_id_to: int
    room_id_from: int
    room_id_to: int
    floor_from: int
    floor_to: int
    center_x_from: float  # Coordonnées étage de départ
    center_y_from: float
    center_x_to: float    # Coordonnées étage d'arrivée
    center_y_to: float
    vertical_type: str = 'stairs'  # 'stairs' ou 'elevator'


class MuseumGraphV2:
    """Graphe complet du musée avec navigation multi-étages"""
    
    def __init__(self, conn):
        self.conn = conn
        self.rooms: Dict[int, Dict] = {}
        self.doors: List[Door] = []
        self.stairways: List[Stairway] = []
        self._load_museum_structure()
    
    def _load_museum_structure(self):
        """Charge salles, portes et escaliers depuis la DB"""
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Mapping plan_id → floor
        cur.execute("SELECT plan_id, nom FROM plans ORDER BY plan_id")
        plan_to_floor = {}
        for idx, row in enumerate(cur.fetchall()):
            plan_to_floor[row['plan_id']] = idx
        
        # Charger salles et créer mapping UUID→entity_id
        cur.execute("""
            SELECT e.entity_id, e.name, e.plan_id, e.description,
                   array_agg(p.x ORDER BY p.ordre) as xs,
                   array_agg(p.y ORDER BY p.ordre) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'ROOM'
            GROUP BY e.entity_id, e.name, e.plan_id, e.description
        """)
        
        uuid_to_entity_id = {}
        
        for row in cur.fetchall():
            floor_num = plan_to_floor.get(row['plan_id'], 0)
            self.rooms[row['entity_id']] = {
                'entity_id': row['entity_id'],
                'name': row['name'],
                'floor': floor_num,
                'polygon': list(zip(row['xs'], row['ys'])) if row['xs'] else []
            }
            
            # Extraire UUID de la description pour mapping
            if row['description']:
                try:
                    room_desc = json.loads(row['description'])
                    room_uuid = room_desc.get('id')
                    if room_uuid:
                        uuid_to_entity_id[room_uuid] = row['entity_id']
                except Exception:
                    pass
        
        # Charger portes depuis les entités DOOR (positions réelles dessinées sur le plan)
        cur.execute("""
            SELECT e.entity_id, e.plan_id, e.description,
                   array_agg(p.x ORDER BY p.ordre) as xs,
                   array_agg(p.y ORDER BY p.ordre) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'DOOR'
            GROUP BY e.entity_id, e.plan_id, e.description
        """)

        seen_pairs = set()
        doors_found = 0
        doors_skipped = 0

        for row in cur.fetchall():
            floor = plan_to_floor.get(row['plan_id'], 0)

            # Identifiants des salles reliées (stockés dans description côté éditeur)
            desc = {}
            if row['description']:
                try:
                    desc = json.loads(row['description'])
                except Exception as e:
                    print(f"  ⚠️  Erreur parsing description porte {row['entity_id']}: {e}")
                    desc = {}

            # Les room_a/room_b peuvent être des UUIDs → convertir en entity_ids
            room_a_raw = desc.get('room_a') or desc.get('roomId') or desc.get('roomIdA')
            room_b_raw = desc.get('room_b') or desc.get('roomIdB')
            
            # Convertir UUID → entity_id si nécessaire
            room_a = None
            room_b = None
            if room_a_raw:
                if isinstance(room_a_raw, str) and len(room_a_raw) > 10:  # Probablement UUID
                    room_a = uuid_to_entity_id.get(room_a_raw)
                    if room_a is None:
                        print(f"  ⚠️  UUID room_a non trouvé: {room_a_raw[:20]}...")
                else:
                    room_a = int(room_a_raw)
            
            if room_b_raw:
                if isinstance(room_b_raw, str) and len(room_b_raw) > 10:  # Probablement UUID
                    room_b = uuid_to_entity_id.get(room_b_raw)
                    if room_b is None:
                        print(f"  ⚠️  UUID room_b non trouvé: {room_b_raw[:20]}...")
                else:
                    room_b = int(room_b_raw)

            # Coordonnées réelles de la porte (milieu du segment dessiné)
            # Les DOOR sont en pixels bruts dans la BD → multiplier par 40 pour cohérence avec ROOM/ARTWORK/VERTICAL_LINK
            xs = row['xs'] or []
            ys = row['ys'] or []
            center_x_raw = sum(xs) / len(xs) if xs else None
            center_y_raw = sum(ys) / len(ys) if ys else None
            
            # Les doors sont maintenant en coordonnées pixel (uniformisé avec ROOM/ARTWORK/VERTICAL_LINK)
            center_x = center_x_raw if center_x_raw is not None else None
            center_y = center_y_raw if center_y_raw is not None else None

            # Fallback: si pas d'ID de salles dans la description, tenter de déduire via la position
            if (room_a is None or room_b is None) and center_x is not None and center_y is not None:
                candidate_rooms = [
                    room_id for room_id, room in self.rooms.items()
                    if room['floor'] == floor and self._point_in_polygon(center_x, center_y, room['polygon'])
                ]
                if len(candidate_rooms) >= 2:
                    room_a, room_b = candidate_rooms[0], candidate_rooms[1]
                    print(f"  ℹ️  Porte {row['entity_id']}: salles déduites par position → {room_a}, {room_b}")

            # Fallback: utiliser centres des salles si le point de porte est manquant
            if (center_x is None or center_y is None) and room_a in self.rooms and room_b in self.rooms:
                poly_a = self.rooms[room_a]['polygon']
                poly_b = self.rooms[room_b]['polygon']
                if poly_a and poly_b:
                    center_a_x = sum(p[0] for p in poly_a) / len(poly_a)
                    center_a_y = sum(p[1] for p in poly_a) / len(poly_a)
                    center_b_x = sum(p[0] for p in poly_b) / len(poly_b)
                    center_b_y = sum(p[1] for p in poly_b) / len(poly_b)
                    center_x = (center_a_x + center_b_x) / 2
                    center_y = (center_a_y + center_b_y) / 2
                    print(f"  ℹ️  Porte {row['entity_id']}: position calculée depuis centres salles → ({center_x:.1f}, {center_y:.1f})")

            # Vérifications de base: ids valides, positions présentes
            if room_a is None or room_b is None or center_x is None or center_y is None:
                doors_skipped += 1
                print(f"  ⚠️  Porte {row['entity_id']} IGNORÉE - room_a={room_a}, room_b={room_b}, pos=({center_x}, {center_y})")
                continue

            # Vérifier existence des salles
            if room_a not in self.rooms or room_b not in self.rooms:
                doors_skipped += 1
                print(f"  ⚠️  Porte {row['entity_id']} IGNORÉE - salle inexistante (room_a={room_a in self.rooms}, room_b={room_b in self.rooms})")
                continue

            # Vérifier cohérence d'étage: les deux salles doivent être sur le même étage que la porte
            floor_a = self.rooms[room_a]['floor']
            floor_b = self.rooms[room_b]['floor']
            if not (floor_a == floor_b == floor):
                doors_skipped += 1
                print(f"  ⚠️  Porte {row['entity_id']} IGNORÉE - incohérence d'étage (door={floor}, a={floor_a}, b={floor_b})")
                continue

            # Vérifier adjacence des salles: éviter portes reliant des salles non voisines
            if not self._rooms_are_adjacent(room_a, room_b):
                doors_skipped += 1
                print(f"  ⚠️  Porte {row['entity_id']} IGNORÉE - salles {room_a} et {room_b} non adjacentes")
                continue

            # Vérifier que le centre de la porte se trouve sur le mur partagé des deux salles
            if not self._door_on_shared_wall(room_a, room_b, center_x, center_y):
                doors_skipped += 1
                print(f"  ⚠️  Porte {row['entity_id']} IGNORÉE - centre ({center_x:.1f},{center_y:.1f}) pas sur le mur partagé {room_a}-{room_b}")
                continue

            # La porte est sur l'étage de son plan_id (déjà validé ci-dessus)
            door_floor = floor

            # Déduplication (porte unique par paire de salles et étage)
            pair = (min(room_a, room_b), max(room_a, room_b), door_floor)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            self.doors.append(Door(
                entity_id=row['entity_id'],
                room_a=int(room_a),
                room_b=int(room_b),
                center_x=center_x,
                center_y=center_y,
                floor=door_floor
            ))
            doors_found += 1
        
        print(f"   ✓ {doors_found} portes chargées, {doors_skipped} ignorées")
        
        # Charger escaliers ET ascenseurs (VERTICAL_LINK groupés par linkGroupId)
        cur.execute("""
            SELECT e.entity_id, e.name, e.plan_id, e.description,
                   array_agg(p.x) as xs, array_agg(p.y) as ys
            FROM entities e
            LEFT JOIN points p ON e.entity_id = p.entity_id
            WHERE e.entity_type = 'VERTICAL_LINK'
            GROUP BY e.entity_id, e.name, e.plan_id, e.description
            ORDER BY e.entity_id
        """)
        
        escaliers_by_group = {}
        for row in cur.fetchall():
            desc = json.loads(row['description']) if row['description'] else {}
            group_id = desc.get('linkGroupId')
            vertical_type = desc.get('type', 'stairs')  # 'stairs' ou 'elevator'
            
            if group_id and row['xs']:
                # Les VERTICAL_LINK sont déjà en coordonnées éditeur dans la BD (comme ROOM et ARTWORK)
                # Pas besoin de conversion
                center_x = sum(row['xs']) / len(row['xs'])
                center_y = sum(row['ys']) / len(row['ys'])
                
                room_id = self._find_room_containing_point(
                    center_x,
                    center_y,
                    plan_to_floor.get(row['plan_id'], 0)
                )
                if room_id is None:
                    # Impossible d'associer ce lien vertical à une salle, ignorer
                    print(f"  ⚠️  Vertical link {row['entity_id']} ignoré - point hors de toute salle")
                    continue

                escalier_data = {
                    'entity_id': row['entity_id'],
                    'name': row['name'],
                    'type': vertical_type,  # Stocker le type (stairs/elevator)
                    'floor': plan_to_floor.get(row['plan_id'], 0),
                    'center_x': center_x,
                    'center_y': center_y,
                    'room_id': room_id
                }
                
                if group_id not in escaliers_by_group:
                    escaliers_by_group[group_id] = []
                escaliers_by_group[group_id].append(escalier_data)
        
        # Créer Stairway pour chaque paire CONSÉCUTIVE (support 3+ escaliers dans un groupe)
        for group_id, escaliers in escaliers_by_group.items():
            if len(escaliers) < 2:
                continue
            
            # Trier par étage
            escaliers.sort(key=lambda e: e['floor'])
            
            # Créer connexions entre étages consécutifs
            for i in range(len(escaliers) - 1):
                escalier_bas = escaliers[i]
                escalier_haut = escaliers[i + 1]
                
                self.stairways.append(Stairway(
                    entity_id_from=escalier_bas['entity_id'],
                    entity_id_to=escalier_haut['entity_id'],
                    room_id_from=escalier_bas['room_id'],
                    room_id_to=escalier_haut['room_id'],
                    floor_from=escalier_bas['floor'],
                    floor_to=escalier_haut['floor'],
                    center_x_from=escalier_bas['center_x'],
                    center_y_from=escalier_bas['center_y'],
                    center_x_to=escalier_haut['center_x'],
                    center_y_to=escalier_haut['center_y'],
                    vertical_type=escalier_bas['type']  # Type (stairs ou elevator)
                ))
        
        cur.close()
    
    def _find_room_containing_point(self, x: float, y: float, floor: int) -> int:
        """Trouve la salle contenant un point. Retourne None si aucune salle ne contient le point."""
        for room_id, room in self.rooms.items():
            if room['floor'] == floor and self._point_in_polygon(x, y, room['polygon']):
                return room_id
        return None
    
    def _point_in_polygon(self, x: float, y: float, polygon: List[Tuple[float, float]]) -> bool:
        """Test si un point est dans un polygone (ray casting)"""
        if not polygon or len(polygon) < 3:
            return False
        
        inside = False
        j = len(polygon) - 1
        
        for i in range(len(polygon)):
            xi, yi = polygon[i]
            xj, yj = polygon[j]
            
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            
            j = i
        
        return inside

    def _rooms_are_adjacent(self, room_a: int, room_b: int, tol: float = 2.0, min_overlap: float = 20.0) -> bool:
        """Vérifie si deux salles partagent un bord (adjacentes) avec une tolérance."""
        poly_a = self.rooms.get(room_a, {}).get('polygon') or []
        poly_b = self.rooms.get(room_b, {}).get('polygon') or []
        if len(poly_a) < 2 or len(poly_b) < 2:
            return False

        def edges(poly):
            return list(zip(poly, poly[1:] + poly[:1]))

        def points_close(p, q, t):
            return abs(p[0] - q[0]) <= t and abs(p[1] - q[1]) <= t

        # Vérifier si au moins une paire d'arêtes est colinéaire et se chevauche (avec tolérance)
        for (a1, a2) in edges(poly_a):
            for (b1, b2) in edges(poly_b):
                # Cas segments horizontaux
                if abs(a1[1] - a2[1]) <= tol and abs(b1[1] - b2[1]) <= tol and abs(a1[1] - b1[1]) <= tol:
                    min_ax, max_ax = sorted([a1[0], a2[0]])
                    min_bx, max_bx = sorted([b1[0], b2[0]])
                    overlap = min(max_ax, max_bx) - max(min_ax, min_bx)
                    if overlap + tol >= min_overlap:
                        return True
                # Cas segments verticaux
                if abs(a1[0] - a2[0]) <= tol and abs(b1[0] - b2[0]) <= tol and abs(a1[0] - b1[0]) <= tol:
                    min_ay, max_ay = sorted([a1[1], a2[1]])
                    min_by, max_by = sorted([b1[1], b2[1]])
                    overlap = min(max_ay, max_by) - max(min_ay, min_by)
                    if overlap + tol >= min_overlap:
                        return True
        return False

    def _door_on_shared_wall(self, room_a: int, room_b: int, x: float, y: float, tol: float = 10.0, min_overlap: float = 20.0) -> bool:
        """Vérifie que (x,y) est sur une arête partagée des deux salles (au sein d'une tolérance)."""
        poly_a = self.rooms.get(room_a, {}).get('polygon') or []
        poly_b = self.rooms.get(room_b, {}).get('polygon') or []
        if len(poly_a) < 2 or len(poly_b) < 2:
            return False

        def edges(poly):
            return list(zip(poly, poly[1] + poly[:1])) if isinstance(poly, list) else []

        # Check horizontals and verticals overlaps and point proximity to the shared segment
        for (a1, a2) in zip(poly_a, poly_a[1:] + poly_a[:1]):
            for (b1, b2) in zip(poly_b, poly_b[1:] + poly_b[:1]):
                # Horizontal shared
                if abs(a1[1] - a2[1]) <= 2.0 and abs(b1[1] - b2[1]) <= 2.0 and abs(a1[1] - b1[1]) <= 2.0:
                    y_line = (a1[1] + a2[1] + b1[1] + b2[1]) / 4.0
                    min_ax, max_ax = sorted([a1[0], a2[0]])
                    min_bx, max_bx = sorted([b1[0], b2[0]])
                    overlap_min = max(min_ax, min_bx)
                    overlap_max = min(max_ax, max_bx)
                    if overlap_max - overlap_min >= min_overlap:
                        # Check point proximity to shared segment
                        if abs(y - y_line) <= tol and (overlap_min - tol) <= x <= (overlap_max + tol):
                            return True
                # Vertical shared
                if abs(a1[0] - a2[0]) <= 2.0 and abs(b1[0] - b2[0]) <= 2.0 and abs(a1[0] - b1[0]) <= 2.0:
                    x_line = (a1[0] + a2[0] + b1[0] + b2[0]) / 4.0
                    min_ay, max_ay = sorted([a1[1], a2[1]])
                    min_by, max_by = sorted([b1[1], b2[1]])
                    overlap_min = max(min_ay, min_by)
                    overlap_max = min(max_ay, max_by)
                    if overlap_max - overlap_min >= min_overlap:
                        if abs(x - x_line) <= tol and (overlap_min - tol) <= y <= (overlap_max + tol):
                            return True
        return False
    
    def get_doors_for_room(self, room_id: int) -> List[Door]:
        """Retourne toutes les portes d'une salle"""
        return [d for d in self.doors if d.room_a == room_id or d.room_b == room_id]
    
    def get_direct_door(self, room_a: int, room_b: int, floor: int) -> Door:
        """Retourne la porte directe entre deux salles (ou None)"""
        for door in self.doors:
            if door.floor == floor:
                if (door.room_a == room_a and door.room_b == room_b) or \
                   (door.room_a == room_b and door.room_b == room_a):
                    return door
        return None
    
    def get_stairways_on_floor(self, floor: int) -> List[Stairway]:
        """Retourne les escaliers accessibles depuis un étage"""
        return [s for s in self.stairways if s.floor_from == floor or s.floor_to == floor]
